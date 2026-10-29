import "server-only"
import mongoose from "mongoose"
import { connectDb } from "@/lib/db/mongoose"
import { AppError, NotFoundError, ValidationError } from "@/lib/errors"
import { getPaymentGateway } from "@/lib/payments"
import { assertPermission, type Actor } from "@/lib/security/authorize"
import { Order, type OrderDoc } from "@/models/order"
import { Payment, type PaymentDoc } from "@/models/payment"
import { Refund, type RefundDoc } from "@/models/refund"
import { recordAudit } from "@/services/audit-service"

const trusted = mongoose.trusted
const oid = (id: string) => new mongoose.Types.ObjectId(id)

/** Refunds above this need a super admin (assumption A-10, to be made a setting). */
export const LARGE_REFUND_PAISE = 500_000

/**
 * Sends money back through the gateway. The amount is claimed on the order first with one conditional
 * update, so total refunds can never exceed what was paid even when two refunds race; if the gateway
 * then fails, the claim is given back. The same idempotency key returns the first result.
 */
export async function refundOrder(input: {
  orderId: string
  amountPaise: number
  reason: string
  idempotencyKey: string
  actorId?: string
}): Promise<RefundDoc> {
  if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise <= 0)
    throw new ValidationError("Enter a refund amount above zero.")
  await connectDb()
  const earlier = await Refund.findOne({ idempotencyKey: input.idempotencyKey }).lean<RefundDoc>()
  if (earlier) return earlier

  const payment = await Payment.findOne({
    orderId: oid(input.orderId),
    status: "captured",
  }).lean<PaymentDoc>()
  if (!payment?.gatewayPaymentId)
    throw new ValidationError("There is no payment to refund for that order.")

  const claimed = await Order.updateOne(
    {
      _id: oid(input.orderId),
      $expr: trusted({
        $lte: [{ $add: ["$refundedPaise", input.amountPaise] }, "$pricing.totalPaise"],
      }),
    },
    { $inc: { refundedPaise: input.amountPaise } }
  )
  if (claimed.modifiedCount !== 1) {
    if (!(await Order.exists({ _id: oid(input.orderId) })))
      throw new NotFoundError("We could not find that order.")
    throw new ValidationError("That is more than was paid and has not already been refunded.")
  }

  let refund: RefundDoc
  try {
    const [created] = await Refund.create([
      {
        orderId: oid(input.orderId),
        paymentId: payment._id,
        amountPaise: input.amountPaise,
        reason: input.reason.slice(0, 300),
        requestedBy: input.actorId ? oid(input.actorId) : undefined,
        idempotencyKey: input.idempotencyKey,
      },
    ])
    refund = created!.toObject() as RefundDoc
  } catch (error) {
    await Order.updateOne(
      { _id: oid(input.orderId) },
      { $inc: { refundedPaise: -input.amountPaise } }
    )
    if ((error as { code?: number }).code === 11000)
      return (await Refund.findOne({ idempotencyKey: input.idempotencyKey }).lean<RefundDoc>())!
    throw error
  }

  try {
    const result = await getPaymentGateway().refund({
      paymentId: payment.gatewayPaymentId,
      amountPaise: input.amountPaise,
      idempotencyKey: input.idempotencyKey,
      notes: { reason: input.reason.slice(0, 100) },
    })
    await Refund.updateOne(
      { _id: refund._id },
      {
        $set: {
          gatewayRefundId: result.gatewayRefundId,
          status: result.status === "processed" ? "processed" : "requested",
        },
      }
    )
  } catch (error) {
    await Refund.updateOne(
      { _id: refund._id },
      { $set: { status: "failed", failureReason: (error as Error).message.slice(0, 300) } }
    )
    await Order.updateOne(
      { _id: oid(input.orderId) },
      { $inc: { refundedPaise: -input.amountPaise } }
    )
    throw error
  }

  const order = await Order.findById(oid(input.orderId)).lean<OrderDoc>()
  if (order) {
    await Order.updateOne(
      { _id: order._id },
      {
        $set: {
          paymentStatus:
            order.refundedPaise >= order.pricing.totalPaise ? "refunded" : "partially_refunded",
        },
      }
    )
  }
  await recordAudit({
    action: "refund.created",
    entityType: "order",
    entityId: input.orderId,
    details: { amountPaise: input.amountPaise, reason: input.reason.slice(0, 100) },
  })
  return (await Refund.findById(refund._id).lean<RefundDoc>())!
}

/** The staff path: needs the refund permission, and a super admin for large amounts. */
export async function refundOrderAsStaff(
  actor: Actor,
  input: { orderId: string; amountPaise: number; reason: string; idempotencyKey: string }
) {
  assertPermission(actor, "refunds:create")
  if (input.amountPaise > LARGE_REFUND_PAISE) assertPermission(actor, "refunds:approve_large")
  if (!input.reason.trim()) throw new ValidationError("Say why the refund is being made.")
  try {
    return await refundOrder({ ...input, actorId: actor.id })
  } catch (error) {
    if (error instanceof AppError) throw error
    throw error
  }
}
