import { WALK_IN_EMAIL } from "@/lib/walk-in"
import "server-only"
import mongoose from "mongoose"
import { csvCell } from "@/lib/csv"
import { STAFF_ROLES } from "@/config/permissions"
import type { CouponInput, SettingsInput } from "@/features/admin/catalog-schemas"
import { connectDb } from "@/lib/db/mongoose"
import { NotFoundError, ValidationError } from "@/lib/errors"
import { availableQty } from "@/lib/inventory"
import { formatQuantity, parseDisplayQuantity } from "@/lib/measure"
import { rupeesToPaise } from "@/lib/money"
import { assertPermission, type Actor } from "@/lib/security/authorize"
import { AuditLog, type AuditLogDoc } from "@/models/audit-log"
import { Coupon, type CouponDoc } from "@/models/coupon"
import { InventoryMovement, type InventoryMovementDoc } from "@/models/inventory-movement"
import { Order } from "@/models/order"
import { Payment, type PaymentDoc } from "@/models/payment"
import { Product, type ProductDoc } from "@/models/product"
import { ProductVariant, type ProductVariantDoc } from "@/models/product-variant"
import { Refund, type RefundDoc } from "@/models/refund"
import { SiteSettings, type SiteSettingsDoc } from "@/models/site-settings"
import { User, type UserDoc } from "@/models/user"
import { recordAudit } from "@/services/audit-service"
import { adjustStock } from "@/services/inventory-service"
import { refreshProductSummary } from "@/services/catalog-service"

const trusted = mongoose.trusted
const oid = (id: string) => new mongoose.Types.ObjectId(id)
const fieldError = (path: string, issue: string) =>
  new ValidationError("Please check the highlighted fields.", [{ path, issue }])
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// ------------------------------------------------------------------ inventory

export type StockRow = {
  variantId: string
  productName: string
  slug: string
  sku: string
  label: string
  onHand: string
  reserved: string
  available: string
  status: "ok" | "low" | "out"
}

async function stockFilter(opts: { show?: "all" | "low" | "out"; q?: string }) {
  const filter: Record<string, unknown> = { status: "active" }
  const available = { $subtract: ["$stock.onHand", "$stock.reserved"] }
  if (opts.show === "out") filter.$expr = trusted({ $lte: [available, 0] })
  if (opts.show === "low")
    filter.$expr = trusted({
      $and: [{ $gt: [available, 0] }, { $lte: [available, "$lowStockThreshold"] }],
    })
  if (opts.q?.trim()) {
    const rx = new RegExp(escapeRegex(opts.q.trim().slice(0, 60)), "i")
    const ids = await Product.find({ name: rx } as never)
      .select({ _id: 1 })
      .limit(200)
      .lean<{ _id: mongoose.Types.ObjectId }[]>()
    filter.$and = [{ $or: [{ sku: rx }, { productId: trusted({ $in: ids.map((i) => i._id) }) }] }]
  }
  return filter
}

async function toStockRows(variants: ProductVariantDoc[]): Promise<StockRow[]> {
  const products = await Product.find({
    _id: trusted({ $in: variants.map((v) => v.productId) }),
  } as never)
    .select({ name: 1, slug: 1 })
    .lean<Pick<ProductDoc, "_id" | "name" | "slug">[]>()
  const byId = new Map(products.map((p) => [String(p._id), p]))
  return variants.map((v) => {
    const avail = availableQty(v.stock)
    return {
      variantId: String(v._id),
      productName: byId.get(String(v.productId))?.name ?? "(removed product)",
      slug: byId.get(String(v.productId))?.slug ?? "",
      sku: v.sku,
      label: [v.options?.colorName, v.options?.size].filter(Boolean).join(", "),
      onHand: formatQuantity(v.sellingUnit, v.stock.onHand),
      reserved: formatQuantity(v.sellingUnit, v.stock.reserved),
      available: formatQuantity(v.sellingUnit, avail),
      status: avail <= 0 ? "out" : avail <= v.lowStockThreshold ? "low" : "ok",
    }
  })
}

export const ADMIN_PAGE_SIZE = 25
export type Paged<T> = { rows: T[]; total: number; pageSize: number }

export async function listStock(
  actor: Actor,
  opts: { show?: "all" | "low" | "out"; q?: string; limit?: number } = {}
): Promise<StockRow[]> {
  assertPermission(actor, "inventory:read")
  await connectDb()
  const variants = await ProductVariant.find((await stockFilter(opts)) as never)
    .sort({ sku: 1 })
    .limit(opts.limit ?? 200)
    .lean<ProductVariantDoc[]>()
  return toStockRows(variants)
}

/** One page of the stock list, with the total so the page can show page numbers. */
export async function listStockPage(
  actor: Actor,
  opts: { show?: "all" | "low" | "out"; q?: string; page?: number } = {}
): Promise<Paged<StockRow>> {
  assertPermission(actor, "inventory:read")
  await connectDb()
  const filter = (await stockFilter(opts)) as never
  const [variants, total] = await Promise.all([
    ProductVariant.find(filter)
      .sort({ sku: 1 })
      .skip((Math.max(1, opts.page ?? 1) - 1) * ADMIN_PAGE_SIZE)
      .limit(ADMIN_PAGE_SIZE)
      .lean<ProductVariantDoc[]>(),
    ProductVariant.countDocuments(filter),
  ])
  return { rows: await toStockRows(variants), total, pageSize: ADMIN_PAGE_SIZE }
}

export async function exportStockCsv(actor: Actor): Promise<string> {
  const rows = await listStock(actor, { limit: 5000 })
  const lines = [
    ["SKU", "Product", "Option", "On hand", "Held for orders", "Available", "Status"].join(","),
  ]
  for (const r of rows)
    lines.push(
      [r.sku, r.productName, r.label, r.onHand, r.reserved, r.available, r.status]
        .map((c) => csvCell(c))
        .join(",")
    )
  return lines.join("\n") + "\n"
}

/** Changes on-hand stock. `amount` is in the item's own unit (metres for fabric). Every change is recorded with who and why. */
export async function adjustStockAdmin(
  actor: Actor,
  variantId: string,
  input: { mode: "add" | "remove" | "set"; amount: string; reason: string; idempotencyKey: string }
): Promise<void> {
  assertPermission(actor, "inventory:adjust")
  await connectDb()
  if (!mongoose.isValidObjectId(variantId)) throw new NotFoundError()
  const variant = await ProductVariant.findById(variantId).lean<ProductVariantDoc>()
  if (!variant) throw new NotFoundError()
  if (input.reason.trim().length < 3) throw fieldError("reason", "Say why the stock is changing.")
  const parsed = parseDisplayQuantity(variant.sellingUnit, input.amount)
  if (!parsed.ok) throw fieldError("amount", parsed.message)
  const delta =
    input.mode === "add"
      ? parsed.qty
      : input.mode === "remove"
        ? -parsed.qty
        : parsed.qty - variant.stock.onHand
  if (delta === 0) throw fieldError("amount", "That is the stock already on hand.")
  await adjustStock({
    variantId,
    delta,
    type: input.mode === "add" ? "restock" : input.mode === "remove" ? "wastage" : "correction",
    reason: input.reason.trim().slice(0, 300),
    idempotencyKey: `admin:${input.idempotencyKey}`.slice(0, 190),
    actorId: actor.id,
  })
  await refreshProductSummary(variant.productId)
  await recordAudit({
    action: "stock.adjusted",
    actor,
    entityType: "variant",
    entityId: variantId,
    details: { mode: input.mode, delta },
  })
}

export async function listMovements(
  actor: Actor,
  variantId: string,
  limit = 30
): Promise<InventoryMovementDoc[]> {
  assertPermission(actor, "inventory:read")
  await connectDb()
  if (!mongoose.isValidObjectId(variantId)) throw new NotFoundError()
  return InventoryMovement.find({ variantId: oid(variantId) })
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit)
    .lean<InventoryMovementDoc[]>()
}

// ------------------------------------------------------------------ coupons

export async function listCoupons(actor: Actor): Promise<CouponDoc[]> {
  assertPermission(actor, "coupons:manage")
  await connectDb()
  return Coupon.find({}).sort({ createdAt: -1 }).limit(200).lean<CouponDoc[]>()
}

export async function listCouponsPage(actor: Actor, page = 1): Promise<Paged<CouponDoc>> {
  assertPermission(actor, "coupons:manage")
  await connectDb()
  const [rows, total] = await Promise.all([
    Coupon.find({})
      .sort({ createdAt: -1, _id: -1 })
      .skip((Math.max(1, page) - 1) * ADMIN_PAGE_SIZE)
      .limit(ADMIN_PAGE_SIZE)
      .lean<CouponDoc[]>(),
    Coupon.countDocuments({}),
  ])
  return { rows, total, pageSize: ADMIN_PAGE_SIZE }
}

export async function getCoupon(actor: Actor, id: string): Promise<CouponDoc> {
  assertPermission(actor, "coupons:manage")
  await connectDb()
  if (!mongoose.isValidObjectId(id)) throw new NotFoundError()
  const c = await Coupon.findById(id).lean<CouponDoc>()
  if (!c) throw new NotFoundError()
  return c
}

const wholeNumber = (text: string | undefined, path: string, min = 1) => {
  if (!text) return undefined
  if (!/^\d{1,7}$/.test(text) || Number(text) < min)
    throw fieldError(path, `Enter a whole number, at least ${min}.`)
  return Number(text)
}
const paise = (text: string | undefined, path: string) => {
  if (!text) return undefined
  try {
    return rupeesToPaise(text)
  } catch {
    throw fieldError(path, "Enter rupees, like 100 or 100.50.")
  }
}

export async function saveCoupon(
  actor: Actor,
  id: string | null,
  input: CouponInput
): Promise<{ id: string }> {
  assertPermission(actor, "coupons:manage")
  await connectDb()
  let percent: number | undefined
  if (input.type === "percent") {
    percent = Number(input.percent)
    if (
      !input.percent ||
      !Number.isFinite(percent) ||
      percent <= 0 ||
      percent > 100 ||
      !/^\d{1,3}(\.\d{1,2})?$/.test(input.percent)
    )
      throw fieldError("percent", "Enter a percentage from 0.01 to 100.")
  }
  const amountPaise = paise(input.amount, "amount")
  if (input.type === "flat" && !amountPaise)
    throw fieldError("amount", "Enter the discount in rupees.")
  const startsAt = input.startsAt ? new Date(`${input.startsAt}T00:00:00+05:30`) : undefined
  const endsAt = input.endsAt ? new Date(`${input.endsAt}T23:59:59+05:30`) : undefined
  if (startsAt && endsAt && endsAt <= startsAt)
    throw fieldError("endsAt", "The end date must be after the start date.")
  const doc = {
    code: input.code,
    description: input.description,
    type: input.type,
    percent,
    amountPaise: input.type === "flat" ? amountPaise : undefined,
    maxDiscountPaise:
      input.type === "percent" ? paise(input.maxDiscount, "maxDiscount") : undefined,
    minOrderPaise: paise(input.minOrder, "minOrder") ?? 0,
    startsAt,
    endsAt,
    usageLimit: wholeNumber(input.usageLimit, "usageLimit"),
    perUserLimit: wholeNumber(input.perUserLimit, "perUserLimit") ?? 1,
    active: input.active,
    showOnHome: input.showOnHome,
  }
  try {
    let savedId: string
    if (id) {
      const loaded = await Coupon.findById(oid(id))
      if (!loaded) throw new NotFoundError()
      loaded.set(doc)
      await loaded.save()
      savedId = id
    } else savedId = String((await Coupon.create(doc))._id)
    // Only one coupon is the home page's offer: featuring this one takes the others off.
    if (input.showOnHome)
      await Coupon.updateMany({ _id: trusted({ $ne: oid(savedId) }), showOnHome: true } as never, {
        $set: { showOnHome: false },
      })
    await recordAudit({
      action: id ? "coupon.updated" : "coupon.created",
      actor,
      entityType: "coupon",
      entityId: savedId,
      details: { code: input.code, showOnHome: input.showOnHome },
    })
    return { id: savedId }
  } catch (error) {
    const e = error as {
      code?: number
      name?: string
      errors?: Record<string, { message: string }>
    }
    if (e.code === 11000) throw fieldError("code", "That code already exists.")
    if (e.name === "ValidationError" && e.errors)
      throw new ValidationError(
        "Please check the highlighted fields.",
        Object.entries(e.errors).map(([path, v]) => ({
          path: path.split(".")[0]!,
          issue: v.message,
        }))
      )
    throw error
  }
}

// ------------------------------------------------------------------ customers and staff

export type CustomerRow = Pick<
  UserDoc,
  "email" | "name" | "role" | "status" | "createdAt" | "lastLoginAt"
> & { id: string; orders: number }

export async function listCustomers(
  actor: Actor,
  opts: { q?: string; staffOnly?: boolean } = {}
): Promise<CustomerRow[]> {
  assertPermission(actor, opts.staffOnly ? "users:manage_roles" : "customers:read")
  await connectDb()
  const filter: Record<string, unknown> = {
    status: trusted({ $ne: "deleted" }),
    email: trusted({ $ne: WALK_IN_EMAIL }),
  }
  if (opts.staffOnly) filter.role = trusted({ $in: [...STAFF_ROLES] })
  if (opts.q?.trim()) {
    const rx = new RegExp(escapeRegex(opts.q.trim().slice(0, 60)), "i")
    filter.$or = [{ email: rx }, { name: rx }]
  }
  const users = await User.find(filter as never)
    .sort({ createdAt: -1, _id: -1 })
    .limit(100)
    .lean<UserDoc[]>()
  const counts = await Order.aggregate<{ _id: mongoose.Types.ObjectId; n: number }>([
    {
      $match: {
        userId: { $in: users.map((u) => u._id) },
        paymentStatus: { $in: ["paid", "partially_refunded", "refunded"] },
      },
    },
    { $group: { _id: "$userId", n: { $sum: 1 } } },
  ])
  const byUser = new Map(counts.map((c) => [String(c._id), c.n]))
  return users.map((u) => ({
    id: String(u._id),
    email: u.email,
    name: u.name,
    role: u.role,
    status: u.status,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
    orders: byUser.get(String(u._id)) ?? 0,
  }))
}

export async function listCustomersPage(
  actor: Actor,
  opts: { q?: string; page?: number } = {}
): Promise<Paged<CustomerRow>> {
  assertPermission(actor, "customers:read")
  await connectDb()
  const filter: Record<string, unknown> = {
    status: trusted({ $ne: "deleted" }),
    email: trusted({ $ne: WALK_IN_EMAIL }),
  }
  if (opts.q?.trim()) {
    const rx = new RegExp(escapeRegex(opts.q.trim().slice(0, 60)), "i")
    filter.$or = [{ email: rx }, { name: rx }]
  }
  const [users, total] = await Promise.all([
    User.find(filter as never)
      .sort({ createdAt: -1, _id: -1 })
      .skip((Math.max(1, opts.page ?? 1) - 1) * ADMIN_PAGE_SIZE)
      .limit(ADMIN_PAGE_SIZE)
      .lean<UserDoc[]>(),
    User.countDocuments(filter as never),
  ])
  const counts = await Order.aggregate<{ _id: mongoose.Types.ObjectId; n: number }>([
    {
      $match: {
        userId: { $in: users.map((u) => u._id) },
        paymentStatus: { $in: ["paid", "partially_refunded", "refunded"] },
      },
    },
    { $group: { _id: "$userId", n: { $sum: 1 } } },
  ])
  const byUser = new Map(counts.map((c) => [String(c._id), c.n]))
  return {
    total,
    pageSize: ADMIN_PAGE_SIZE,
    rows: users.map((u) => ({
      id: String(u._id),
      email: u.email,
      name: u.name,
      role: u.role,
      status: u.status,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
      orders: byUser.get(String(u._id)) ?? 0,
    })),
  }
}

// ------------------------------------------------------------------ settings

export async function getSettingsAdmin(actor: Actor): Promise<SiteSettingsDoc | null> {
  assertPermission(actor, "settings:write")
  await connectDb()
  return SiteSettings.findOne({ key: "default" }).lean<SiteSettingsDoc>()
}

export async function saveSettings(actor: Actor, input: SettingsInput): Promise<void> {
  assertPermission(actor, "settings:write")
  await connectDb()
  const rate = Number(input.taxRate)
  if (rate > 99.99) throw fieldError("taxRate", "A rate from 0 to 99.99.")
  const announcementHref = input.announcementHref
  if (announcementHref && !/^\/[^\s]*$/.test(announcementHref))
    throw fieldError("announcementHref", "Use a path on this site, like /sale.")
  if (input.announcementEnabled && !input.announcementText)
    throw fieldError("announcementText", "Write the message to show.")
  const minutes = Number(input.reservationMinutes)
  if (minutes < 5)
    throw fieldError("reservationMinutes", "At least 5 minutes, so people can finish paying.")
  const flat = paise(input.flatShipping, "flatShipping") ?? 0
  const free = paise(input.freeShippingFrom, "freeShippingFrom")
  // A box left empty clears the stored value (a $set of undefined would leave the old one in place).
  const optional: Record<string, string | undefined> = {
    "store.email": input.storeEmail || undefined,
    "store.phone": input.storePhone || undefined,
    "store.legalName": input.legalName || undefined,
    "store.gstin": input.gstin || undefined,
    "announcement.text": input.announcementText || undefined,
    "announcement.href": announcementHref || undefined,
  }
  const set: Record<string, unknown> = {
    "store.name": input.storeName,
    "store.addressLines": input.storeAddress,
    "shipping.flatRatePaise": flat,
    "orders.returnWindowDays": Number(input.returnWindowDays),
    "inventory.reservationMinutes": minutes,
    "tax.enabled": input.taxEnabled,
    "tax.mode": input.taxMode,
    "tax.defaultRatePercent": rate,
    "announcement.enabled": input.announcementEnabled,
  }
  const unset: Record<string, 1> = {}
  for (const [key, value] of Object.entries(optional)) {
    if (value === undefined) unset[key] = 1
    else set[key] = value
  }
  if (free === undefined) unset["shipping.freeThresholdPaise"] = 1
  else set["shipping.freeThresholdPaise"] = free
  await SiteSettings.updateOne(
    { key: "default" },
    {
      $set: set,
      ...(Object.keys(unset).length ? { $unset: unset } : {}),
      $setOnInsert: { key: "default" },
    },
    { upsert: true }
  )
  await recordAudit({
    action: "settings.updated",
    actor,
    entityType: "settings",
    details: { taxEnabled: input.taxEnabled, flat, free: free ?? null },
  })
}

// ------------------------------------------------------------------ audit log and payments

export async function listAuditLog(
  actor: Actor,
  opts: { action?: string; page?: number } = {}
): Promise<{ rows: (AuditLogDoc & { actorEmail?: string })[]; total: number; pageSize: number }> {
  assertPermission(actor, "auditlogs:read")
  await connectDb()
  const pageSize = 50
  const filter: Record<string, unknown> = {}
  if (opts.action?.trim())
    filter.action = new RegExp(`^${escapeRegex(opts.action.trim().slice(0, 40))}`)
  const [rows, total] = await Promise.all([
    AuditLog.find(filter as never)
      .sort({ at: -1, _id: -1 })
      .skip(((opts.page ?? 1) - 1) * pageSize)
      .limit(pageSize)
      .lean<AuditLogDoc[]>(),
    AuditLog.countDocuments(filter as never),
  ])
  const users = await User.find({
    _id: trusted({ $in: rows.flatMap((r) => (r.actorId ? [r.actorId] : [])) }),
  } as never)
    .select({ email: 1 })
    .lean<{ _id: mongoose.Types.ObjectId; email: string }[]>()
  const email = new Map(users.map((u) => [String(u._id), u.email]))
  return {
    total,
    pageSize,
    rows: rows.map((r) => ({
      ...r,
      actorEmail: r.actorId ? email.get(String(r.actorId)) : undefined,
    })),
  }
}

export async function listPaymentsForOrder(
  actor: Actor,
  orderNumber: string
): Promise<{ payments: PaymentDoc[]; refunds: RefundDoc[] }> {
  assertPermission(actor, "payments:read")
  await connectDb()
  const order = await Order.findOne({ orderNumber })
    .select({ _id: 1 })
    .lean<{ _id: mongoose.Types.ObjectId }>()
  if (!order) throw new NotFoundError("We could not find that order.")
  const id = order._id
  const [payments, refunds] = await Promise.all([
    Payment.find({ orderId: id }).lean<PaymentDoc[]>(),
    Refund.find({ orderId: id }).sort({ createdAt: -1 }).lean<RefundDoc[]>(),
  ])
  return { payments, refunds }
}
