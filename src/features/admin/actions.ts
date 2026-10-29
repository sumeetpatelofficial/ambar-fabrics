"use server"

import { updateTag } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { ROLES, type Role } from "@/config/permissions"
import {
  categoryInputSchema,
  collectionInputSchema,
  couponInputSchema,
  productInputSchema,
  settingsInputSchema,
  variantDraftSchema,
  variantInputSchema,
} from "@/features/admin/catalog-schemas"
import { errorState, fieldErrorsFrom, invalid, safeValues } from "@/features/form-errors"
import type { FormState } from "@/features/form-state"
import { requireActor } from "@/lib/auth/session"
import { AppError } from "@/lib/errors"
import { getRequestContext } from "@/lib/request-context"
import { enforceRateLimit, type RateRule } from "@/lib/security/rate-limit"
import { changeUserRole, setUserStatus } from "@/services/auth-service"
import {
  saveCategory,
  saveCollection,
  saveProduct,
  saveVariant,
  createProductWithVariants,
  reorderCategories,
} from "@/services/admin-catalog-service"
import { adjustStockAdmin, saveCoupon, saveSettings } from "@/services/admin-ops-service"
import { Order } from "@/models/order"
import { connectDb } from "@/lib/db/mongoose"
import { refundOrderAsStaff } from "@/services/refund-service"
import { deleteTaxon, reorderTaxa, saveTaxon } from "@/services/admin-taxonomy-service"
import type { Layout } from "@/lib/tree-order"
import { SLUG_PATTERN } from "@/lib/slug"
import type { UploadTicket } from "@/lib/cloudinary"
import { getUploadTicket } from "@/services/upload-service"
import { deleteRedirect, saveRedirect } from "@/services/seo-service"
import { resetPage, savePage } from "@/services/content-service"
import { deleteReview, moderateReview } from "@/services/review-service"
import { paiseFromRupeeText } from "@/features/admin/money-input"
import {
  createOfflineOrder,
  previewOfflineOrder,
  searchSellable,
  voidOfflineOrder,
  type OfflinePreview,
  type SellableRow,
} from "@/services/offline-order-service"

const ADMIN_WRITE: RateRule = { name: "admin", limit: 300, windowSeconds: 10 * 60 }

/** Every admin write: who is acting comes from the session, then a limit; the service checks the permission. */
async function admin(returnTo: string) {
  const actor = await requireActor(returnTo)
  const ctx = await getRequestContext()
  await enforceRateLimit(ADMIN_WRITE, `user:${actor.id}`)
  return { actor, ctx }
}

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "")
const plain = (fd: FormData) => Object.fromEntries(fd) as Record<string, string>

/** Catalogue pages are cached; an edit expires them at once so the editor sees their own change. */
function expireCatalog(...extra: string[]) {
  for (const tag of ["catalog", "catalog:list", "categories", ...extra]) updateTag(tag)
}

export async function saveProductAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = productInputSchema.safeParse(plain(fd))
  if (!parsed.success) return invalid(parsed.error, fd)
  const id = text(fd, "id") || null
  let savedId: string
  try {
    const { actor } = await admin("/admin/products")
    const saved = await saveProduct(actor, id, parsed.data)
    savedId = saved.id
    expireCatalog(`product:${saved.slug}`)
  } catch (error) {
    return errorState(error, fd)
  }
  if (!id) redirect(`/admin/products/${savedId}?created=1`)
  return { status: "success", message: "Product saved." }
}

export async function saveVariantAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = variantInputSchema.safeParse(plain(fd))
  if (!parsed.success) return invalid(parsed.error, fd)
  const productId = text(fd, "productId")
  try {
    const { actor } = await admin("/admin/products")
    await saveVariant(actor, productId, text(fd, "variantId") || null, parsed.data)
    expireCatalog()
  } catch (error) {
    return errorState(error, fd)
  }
  return { status: "success", message: "Variant saved." }
}

export async function saveCategoryAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = categoryInputSchema.safeParse(plain(fd))
  if (!parsed.success) return invalid(parsed.error, fd)
  const id = text(fd, "id") || null
  try {
    const { actor } = await admin("/admin/categories")
    await saveCategory(actor, id, parsed.data)
    expireCatalog()
  } catch (error) {
    return errorState(error, fd)
  }
  redirect("/admin/categories?saved=1")
}

export async function saveCollectionAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = collectionInputSchema.safeParse(plain(fd))
  if (!parsed.success) return invalid(parsed.error, fd)
  const id = text(fd, "id") || null
  try {
    const { actor } = await admin("/admin/collections")
    await saveCollection(actor, id, parsed.data)
    expireCatalog()
  } catch (error) {
    return errorState(error, fd)
  }
  redirect("/admin/collections?saved=1")
}

export async function saveCouponAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = couponInputSchema.safeParse(plain(fd))
  if (!parsed.success) return invalid(parsed.error, fd)
  try {
    const { actor } = await admin("/admin/coupons")
    await saveCoupon(actor, text(fd, "id") || null, parsed.data)
  } catch (error) {
    return errorState(error, fd)
  }
  redirect("/admin/coupons?saved=1")
}

export async function saveSettingsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = settingsInputSchema.safeParse(plain(fd))
  if (!parsed.success) return invalid(parsed.error, fd)
  try {
    const { actor } = await admin("/admin/settings")
    await saveSettings(actor, parsed.data)
    updateTag("settings")
  } catch (error) {
    return errorState(error, fd)
  }
  return { status: "success", message: "Settings saved." }
}

const stockSchema = z.object({
  variantId: z.string().regex(/^[0-9a-f]{24}$/),
  mode: z.enum(["add", "remove", "set"]),
  amount: z.string().trim().min(1, "Enter an amount."),
  reason: z.string().trim().min(3, "Say why the stock is changing."),
  key: z.string().min(8).max(80),
})

export async function adjustStockAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = stockSchema.safeParse(plain(fd))
  if (!parsed.success) return invalid(parsed.error, fd)
  try {
    const { actor } = await admin("/admin/inventory")
    await adjustStockAdmin(actor, parsed.data.variantId, {
      mode: parsed.data.mode,
      amount: parsed.data.amount,
      reason: parsed.data.reason,
      idempotencyKey: parsed.data.key,
    })
    expireCatalog()
  } catch (error) {
    return errorState(error, fd)
  }
  return { status: "success", message: "Stock updated." }
}

type Done = { ok: true } | { ok: false; message: string }
const fail = (error: unknown): { ok: false; message: string } => ({
  ok: false,
  message:
    error instanceof AppError && error.status < 500
      ? error.message
      : "Something went wrong. Please try again.",
})

export async function setCustomerStatusAction(
  userId: string,
  status: "active" | "suspended"
): Promise<Done> {
  try {
    const { actor, ctx } = await admin("/admin/customers")
    await setUserStatus(actor, userId, status, ctx)
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function changeRoleAction(userId: string, role: string): Promise<Done> {
  try {
    if (!(ROLES as readonly string[]).includes(role))
      return { ok: false, message: "That role does not exist." }
    const { actor, ctx } = await admin("/admin/staff")
    await changeUserRole(actor, userId, role as Role, ctx)
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

/** A refund entered by staff: rupees and a reason. A repeated click carries the same key and refunds once. */
export async function refundOrderAction(
  orderNumber: string,
  rupees: string,
  reason: string,
  key: string
): Promise<Done> {
  try {
    const { actor } = await admin("/admin/orders")
    if (!/^[A-Z0-9-]{6,30}$/.test(orderNumber) || key.length < 8 || key.length > 80)
      return { ok: false, message: "Please try again." }
    const amountPaise = paiseFromRupeeText(rupees)
    if (amountPaise === null)
      return { ok: false, message: "Enter the amount in rupees, like 250 or 250.50." }
    await connectDb()
    const order = await Order.findOne({ orderNumber }).select({ _id: 1 }).lean()
    if (!order) return { ok: false, message: "We could not find that order." }
    await refundOrderAsStaff(actor, {
      orderId: String(order._id),
      amountPaise,
      reason,
      idempotencyKey: `staff:${key}`,
    })
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

/** Staff read a review and let it through or turn it down. The product's average and its cached page update at once. */
export async function moderateReviewAction(
  reviewId: string,
  approve: boolean,
  note: string
): Promise<Done> {
  try {
    const { actor } = await admin("/admin/reviews")
    const { slug } = await moderateReview(
      actor,
      reviewId,
      approve ? { approve: true } : { approve: false, note }
    )
    updateTag(`reviews:${slug}`)
    updateTag(`product:${slug}`)
    updateTag("catalog:list")
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function deleteReviewAction(reviewId: string): Promise<Done> {
  try {
    const { actor } = await admin("/admin/reviews")
    const { slug } = await deleteReview(actor, reviewId)
    updateTag(`reviews:${slug}`)
    updateTag(`product:${slug}`)
    updateTag("catalog:list")
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

const pageSchema = z.object({
  slug: z.string().max(40),
  title: z.string().trim().min(2, "Enter a title.").max(120),
  description: z.string().trim().max(320).optional(),
  body: z.string().max(20000, "That is too long."),
})

export async function savePageAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = pageSchema.safeParse(plain(fd))
  if (!parsed.success) return invalid(parsed.error, fd)
  try {
    const { actor } = await admin("/admin/pages")
    await savePage(actor, parsed.data.slug, parsed.data)
    updateTag(`page:${parsed.data.slug}`)
    updateTag("pages")
  } catch (error) {
    return errorState(error, fd)
  }
  return { status: "success", message: "Page saved." }
}

export async function resetPageAction(slug: string): Promise<Done> {
  try {
    const { actor } = await admin("/admin/pages")
    await resetPage(actor, slug)
    updateTag(`page:${slug}`)
    updateTag("pages")
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

const redirectSchema = z.object({
  fromPath: z.string().trim().max(300),
  toPath: z.string().trim().max(300),
  kind: z.enum(["permanent", "temporary"]),
})

export async function saveRedirectAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = redirectSchema.safeParse(plain(fd))
  if (!parsed.success) return invalid(parsed.error, fd)
  try {
    const { actor } = await admin("/admin/redirects")
    await saveRedirect(actor, {
      fromPath: parsed.data.fromPath,
      toPath: parsed.data.toPath,
      permanent: parsed.data.kind === "permanent",
    })
  } catch (error) {
    return errorState(error, fd)
  }
  return { status: "success", message: "Redirect saved." }
}

export async function deleteRedirectAction(id: string): Promise<Done> {
  try {
    const { actor } = await admin("/admin/redirects")
    await deleteRedirect(actor, id)
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

/** Asks for permission to upload photographs. Returns null when Cloudinary is not set up yet. */
export async function getUploadTicketAction(): Promise<
  { ok: true; ticket: UploadTicket | null } | { ok: false; message: string }
> {
  try {
    const { actor } = await admin("/admin/products")
    return { ok: true, ticket: getUploadTicket(actor) }
  } catch (error) {
    return fail(error) as { ok: false; message: string }
  }
}

/** The variants typed into the new-product form arrive as `variants.0.price`, `variants.1.colorName` and so on. */
function variantRows(fd: FormData): Record<string, string>[] {
  const rows = new Map<number, Record<string, string>>()
  for (const [key, value] of fd.entries()) {
    const m = /^variants\.(\d{1,2})\.([A-Za-z]+)$/.exec(key)
    if (!m || typeof value !== "string") continue
    const index = Number(m[1])
    rows.set(index, { ...(rows.get(index) ?? {}), [m[2]!]: value })
  }
  return [...rows.entries()].sort(([a], [b]) => a - b).map(([, r]) => r)
}

/** Creates the product and its first colours, prices, purchase prices and stock in one step. */
export async function createProductAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = productInputSchema.safeParse(plain(fd))
  const rows = variantRows(fd)
  const drafts = rows.map((r) => variantDraftSchema.safeParse(r))
  const fieldErrors: Record<string, string> = {}
  if (!parsed.success) Object.assign(fieldErrors, fieldErrorsFrom(parsed.error))
  drafts.forEach((d, i) => {
    if (!d.success)
      for (const issue of d.error.issues) {
        const key = `variants.${i}.${String(issue.path[0] ?? "form")}`
        if (!(key in fieldErrors)) fieldErrors[key] = issue.message
      }
  })
  if (rows.length === 0)
    fieldErrors["variants"] = "Add at least one colour or size, with its price and stock."
  if (Object.keys(fieldErrors).length > 0 || !parsed.success)
    return {
      status: "error",
      message: "Please check the highlighted fields.",
      fieldErrors,
      values: safeValues(fd),
    }
  let created: { id: string; slug: string }
  try {
    const { actor } = await admin("/admin/products")
    created = await createProductWithVariants(
      actor,
      parsed.data,
      drafts.map((d) => (d as { data: z.infer<typeof variantDraftSchema> }).data)
    )
    expireCatalog(`product:${created.slug}`)
  } catch (error) {
    const state = errorState(error, fd)
    return state
  }
  redirect(`/admin/products/${created.id}?created=1`)
}

const objectIdText = z.string().regex(/^[0-9a-f]{24}$/)
const layoutSchema = z
  .array(z.object({ id: objectIdText, children: z.array(objectIdText).max(300) }))
  .max(300)

/** The category menu as arranged by dragging. Saved whole, and refused if it does not match what exists. */
export async function reorderCategoriesAction(layout: Layout): Promise<Done> {
  const parsed = layoutSchema.safeParse(layout)
  if (!parsed.success) return { ok: false, message: "That order is not valid." }
  try {
    const { actor } = await admin("/admin/categories")
    await reorderCategories(actor, parsed.data)
    expireCatalog()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

const KINDS = z.enum(["fabric", "print"])

/** Fabrics and prints in the order set by dragging. */
export async function reorderTaxaAction(kind: string, ids: string[]): Promise<Done> {
  const k = KINDS.safeParse(kind)
  const list = z.array(objectIdText).max(500).safeParse(ids)
  if (!k.success || !list.success) return { ok: false, message: "That order is not valid." }
  try {
    const { actor } = await admin("/admin/fabrics")
    await reorderTaxa(actor, k.data, list.data)
    expireCatalog()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

const taxonSchema = z.object({
  kind: KINDS,
  id: z.string().optional(),
  name: z.string().trim().min(2, "Enter a name.").max(60, "Use at most 60 characters."),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .max(80)
    .regex(SLUG_PATTERN, "Use lowercase letters, numbers and single hyphens.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  description: z.string().trim().max(2000).optional(),
  status: z.enum(["active", "hidden"]),
})

export async function saveTaxonAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = taxonSchema.safeParse(plain(fd))
  if (!parsed.success) return invalid(parsed.error, fd)
  const { kind, id, ...rest } = parsed.data
  try {
    const { actor } = await admin(`/admin/${kind}s`)
    await saveTaxon(actor, kind, id || null, rest)
    expireCatalog()
  } catch (error) {
    return errorState(error, fd)
  }
  redirect(`/admin/${kind}s?saved=1`)
}

export async function deleteTaxonAction(id: string, kind: string): Promise<Done> {
  const k = KINDS.safeParse(kind)
  if (!objectIdText.safeParse(id).success || !k.success)
    return { ok: false, message: "That is not valid." }
  try {
    const { actor } = await admin(`/admin/${k.data}s`)
    await deleteTaxon(actor, id)
    expireCatalog()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

// ------------------------------------------------------------------ sales made in the shop

const saleSchema = z.object({
  lines: z
    .array(
      z.object({
        variantId: z.string().regex(/^[0-9a-f]{24}$/),
        qty: z.number().int().positive().max(1_000_000_000),
      })
    )
    .min(1, "Add at least one item.")
    .max(40),
  discount: z
    .object({
      kind: z.enum(["amount", "percent"]),
      /** Rupees or a percentage, as typed. */
      text: z.string().trim().max(12),
      reason: z.string().trim().max(200),
    })
    .nullable(),
  customer: z.object({ name: z.string().trim().max(80), phone: z.string().trim().max(20) }),
  method: z.enum(["cash", "upi", "card"]),
  note: z.string().trim().max(200),
  key: z.string().min(16).max(100),
})
export type SaleInput = z.input<typeof saleSchema>

function discountFrom(d: SaleInput["discount"]) {
  if (!d || !d.text) return { ok: true as const, discount: undefined }
  if (d.kind === "percent") {
    const value = Number(d.text)
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(d.text) || !Number.isFinite(value))
      return { ok: false as const, message: "Enter the percentage like 10 or 7.5." }
    return { ok: true as const, discount: { kind: "percent" as const, value, reason: d.reason } }
  }
  const paise = paiseFromRupeeText(d.text)
  if (paise === null)
    return { ok: false as const, message: "Enter the discount in rupees, like 250 or 250.50." }
  return {
    ok: true as const,
    discount: { kind: "amount" as const, value: paise, reason: d.reason },
  }
}

export async function searchSellableAction(
  query: string
): Promise<{ ok: true; rows: SellableRow[] } | { ok: false; message: string }> {
  try {
    const actor = await requireActor("/admin/orders/new")
    return { ok: true, rows: await searchSellable(actor, String(query).slice(0, 60)) }
  } catch (error) {
    return fail(error)
  }
}

export async function previewSaleAction(
  input: Pick<SaleInput, "lines" | "discount">
): Promise<{ ok: true; preview: OfflinePreview } | { ok: false; message: string }> {
  try {
    const parsed = saleSchema.pick({ lines: true, discount: true }).safeParse(input)
    if (!parsed.success)
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the items." }
    const d = discountFrom(parsed.data.discount)
    if (!d.ok) return d
    const actor = await requireActor("/admin/orders/new")
    return { ok: true, preview: await previewOfflineOrder(actor, parsed.data.lines, d.discount) }
  } catch (error) {
    return fail(error)
  }
}

export async function recordSaleAction(
  input: SaleInput
): Promise<{ ok: true; orderNumber: string } | { ok: false; message: string }> {
  try {
    const parsed = saleSchema.safeParse(input)
    if (!parsed.success)
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the sale." }
    const d = discountFrom(parsed.data.discount)
    if (!d.ok) return d
    const { actor } = await admin("/admin/orders/new")
    const done = await createOfflineOrder(actor, {
      lines: parsed.data.lines,
      customer: parsed.data.customer,
      discount: d.discount,
      method: parsed.data.method,
      note: parsed.data.note,
      idempotencyKey: parsed.data.key,
    })
    expireCatalog()
    return { ok: true, orderNumber: done.orderNumber }
  } catch (error) {
    return fail(error)
  }
}

export async function voidSaleAction(orderNumber: string, reason: string): Promise<Done> {
  try {
    if (!/^[A-Z0-9-]{6,30}$/.test(orderNumber)) return { ok: false, message: "Please try again." }
    const { actor } = await admin("/admin/orders")
    await voidOfflineOrder(actor, orderNumber, reason)
    expireCatalog()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}
