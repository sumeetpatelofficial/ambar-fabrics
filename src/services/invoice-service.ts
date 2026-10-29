import "server-only"
import mongoose from "mongoose"
import { connectDb } from "@/lib/db/mongoose"
import { NotFoundError, ValidationError } from "@/lib/errors"
import { financialYear } from "@/lib/financial-year"
import { formatQuantity, priceUnitLabel } from "@/lib/measure"
import { assertPermission, type Actor } from "@/lib/security/authorize"
import { Counter } from "@/models/counter"
import { Order, type OrderDoc } from "@/models/order"
import { Payment, type PaymentDoc } from "@/models/payment"
import { SiteSettings } from "@/models/site-settings"

const oid = (id: string | mongoose.Types.ObjectId) => new mongoose.Types.ObjectId(String(id))
const PAID = ["paid", "partially_refunded", "refunded"]

/**
 * Gives an order its invoice number the first time its invoice is produced. Numbers are gapless within a
 * financial year (INV/2026-27/000001, 000002, ...): the counter and the order are changed in one transaction,
 * so a failed attempt leaves no hole, and two attempts at once give the order one number.
 */
export async function ensureInvoice(
  orderId: string,
  now = new Date()
): Promise<NonNullable<OrderDoc["invoice"]>> {
  await connectDb()
  const existing = await Order.findById(oid(orderId))
    .select({ invoice: 1, paymentStatus: 1, status: 1 })
    .lean<OrderDoc>()
  if (!existing) throw new NotFoundError("We could not find that order.")
  if (existing.invoice) return existing.invoice
  if (
    !PAID.includes(existing.paymentStatus) ||
    ["pending_payment", "expired"].includes(existing.status)
  )
    throw new ValidationError("An invoice is made once an order has been paid.")
  const fy = financialYear(now)
  const session = await mongoose.startSession()
  try {
    await session.withTransaction(async () => {
      const unnumbered = await Order.exists({
        _id: oid(orderId),
        invoice: mongoose.trusted({ $exists: false }),
      }).session(session)
      if (!unnumbered) return // someone else numbered it first
      const counter = await Counter.findOneAndUpdate(
        { _id: `invoice:${fy}` },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: "after", session }
      ).lean()
      await Order.updateOne(
        { _id: oid(orderId), invoice: mongoose.trusted({ $exists: false }) },
        {
          $set: {
            invoice: {
              number: `INV/${fy}/${String(counter!.seq).padStart(6, "0")}`,
              issuedAt: now,
              financialYear: fy,
            },
          },
        },
        { session }
      )
    })
  } finally {
    await session.endSession()
  }
  const done = await Order.findById(oid(orderId)).select({ invoice: 1 }).lean<OrderDoc>()
  return done!.invoice!
}

export type InvoiceData = {
  title: "Tax Invoice" | "Bill of Supply"
  number: string
  issuedAt: string
  orderNumber: string
  orderedAt: string
  seller: { name: string; addressLines: string[]; phone?: string; email?: string; gstin?: string }
  buyer: { name: string; lines: string[]; phone: string; email: string }
  /** True for a sale made in the shop: the bill shows no delivery address or email. */
  inStore?: boolean
  lines: {
    description: string
    detail?: string
    quantity: string
    unitLabel: string
    ratePaise: number
    amountPaise: number
    taxRatePercent: number
    taxPaise: number
  }[]
  subtotalPaise: number
  discountPaise: number
  couponCode?: string
  shippingPaise: number
  taxPaise: number
  taxExclusive: boolean
  totalPaise: number
  refundedPaise: number
  payment: string
  note: string
}

async function build(order: OrderDoc): Promise<InvoiceData> {
  const invoice = await ensureInvoice(String(order._id))
  const fresh = (await Order.findById(order._id).lean<OrderDoc>())!
  const [settings, payment] = await Promise.all([
    SiteSettings.findOne({ key: "default" }).lean<{
      store: {
        name: string
        legalName?: string
        addressLines: string[]
        phone?: string
        email?: string
        gstin?: string
      }
      tax: { enabled: boolean }
    }>(),
    Payment.findOne({ orderId: order._id, status: "captured" }).lean<PaymentDoc>(),
  ])
  const gstin = settings?.store.gstin
  const taxInvoice = Boolean(settings?.tax.enabled && gstin)
  const a = fresh.shippingAddress
  const inStore = fresh.channel === "store"
  return {
    title: taxInvoice ? "Tax Invoice" : "Bill of Supply",
    number: invoice.number,
    issuedAt: invoice.issuedAt.toISOString(),
    orderNumber: fresh.orderNumber,
    orderedAt: (fresh.placedAt ?? fresh.createdAt).toISOString(),
    seller: {
      name: settings?.store.legalName || settings?.store.name || "Ambar",
      addressLines: settings?.store.addressLines ?? [],
      phone: settings?.store.phone,
      email: settings?.store.email,
      ...(taxInvoice ? { gstin } : {}),
    },
    ...(inStore ? { inStore } : {}),
    buyer: inStore
      ? { name: a.fullName, lines: [], phone: a.phone, email: "" }
      : {
          name: a.fullName,
          lines: [
            [a.line1, a.line2, a.landmark].filter(Boolean).join(", "),
            `${a.city}, ${a.state} ${a.pincode}`,
          ],
          phone: a.phone,
          email: fresh.email,
        },
    lines: fresh.items.map((i) => ({
      description: i.name,
      detail: [i.colorName, i.size].filter(Boolean).join(", ") || undefined,
      quantity: formatQuantity(i.unit, i.qty),
      unitLabel: priceUnitLabel(i.unit),
      ratePaise: i.unitPricePaise,
      amountPaise: i.linePaise - i.discountPaise,
      taxRatePercent: i.taxRatePercent,
      taxPaise: i.taxPaise,
    })),
    subtotalPaise: fresh.pricing.subtotalPaise,
    discountPaise: fresh.pricing.discountPaise,
    ...(fresh.coupon ? { couponCode: fresh.coupon.code } : {}),
    shippingPaise: fresh.pricing.shippingPaise,
    taxPaise: fresh.pricing.taxPaise,
    taxExclusive: fresh.pricing.taxExclusive,
    totalPaise: fresh.pricing.totalPaise,
    refundedPaise: fresh.refundedPaise,
    payment: inStore
      ? `Paid in the shop by ${{ cash: "cash", upi: "UPI", card: "card" }[fresh.paymentMethod ?? "cash"]}`
      : payment?.gatewayPaymentId
        ? `Paid online, reference ${payment.gatewayPaymentId}`
        : "Paid online",
    note: taxInvoice
      ? "Fabric cut to length cannot be returned. This is a computer-generated invoice and needs no signature."
      : "Issued by a supplier who is not registered under GST, so no GST is charged. Fabric cut to length cannot be returned. This is a computer-generated bill and needs no signature.",
  }
}

/** A customer's own invoice. Anyone else's order is "not found". */
export async function getInvoiceForUser(userId: string, orderNumber: string): Promise<InvoiceData> {
  await connectDb()
  const order = await Order.findOne({ orderNumber, userId: oid(userId) }).lean<OrderDoc>()
  if (!order) throw new NotFoundError("We could not find that order.")
  return build(order)
}

export async function getInvoiceForStaff(actor: Actor, orderNumber: string): Promise<InvoiceData> {
  assertPermission(actor, "orders:read")
  await connectDb()
  const order = await Order.findOne({ orderNumber }).lean<OrderDoc>()
  if (!order) throw new NotFoundError("We could not find that order.")
  return build(order)
}
