import "server-only"
import { connectDb } from "@/lib/db/mongoose"
import { logger } from "@/lib/logger"
import { getPaymentGateway } from "@/lib/payments"
import { Refund } from "@/models/refund"
import { WebhookEvent } from "@/models/webhook-event"
import { markPaymentCaptured, markPaymentFailed } from "@/services/order-service"

type Entity = Record<string, unknown>
const asEntity = (v: unknown): Entity | undefined =>
  v && typeof v === "object" ? (v as Entity) : undefined
const str = (v: unknown) => (typeof v === "string" ? v : undefined)
const num = (v: unknown) => (typeof v === "number" && Number.isSafeInteger(v) ? v : undefined)

export type WebhookResult = { status: 200 | 400 | 401 | 500; body: Record<string, unknown> }

/**
 * Razorpay's server-to-server messages. Order of checks: the signature over the exact raw body, then
 * "have I seen this event id", then the work. A repeated delivery does nothing; a delivery that failed
 * halfway is processed again (the work itself is safe to repeat). Answering 5xx makes Razorpay retry.
 */
export async function handleRazorpayWebhook(input: {
  rawBody: string
  signature: string | null
  eventId: string | null
}): Promise<WebhookResult> {
  const gateway = getPaymentGateway()
  if (!input.signature || !gateway.verifyWebhookSignature(input.rawBody, input.signature))
    return { status: 401, body: { error: "invalid signature" } }
  if (!input.eventId || input.eventId.length > 120)
    return { status: 400, body: { error: "missing event id" } }

  let event: Entity | undefined
  try {
    event = asEntity(JSON.parse(input.rawBody))
  } catch {
    return { status: 400, body: { error: "invalid body" } }
  }
  const type = str(event?.event)
  if (!event || !type) return { status: 400, body: { error: "invalid body" } }

  await connectDb()
  try {
    await WebhookEvent.create({
      provider: "razorpay",
      eventId: input.eventId,
      type: type.slice(0, 80),
    })
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error
    const seen = await WebhookEvent.findOne({ provider: "razorpay", eventId: input.eventId }).lean()
    if (seen && seen.status !== "failed" && seen.status !== "received")
      return { status: 200, body: { duplicate: true } }
    // An earlier delivery did not finish: do the work again.
  }

  try {
    const payload = asEntity(event.payload)
    const payment = asEntity(asEntity(payload?.payment)?.entity)
    const refund = asEntity(asEntity(payload?.refund)?.entity)
    let outcome: "processed" | "ignored" = "processed"

    if ((type === "payment.captured" || type === "order.paid") && payment) {
      const orderId = str(payment.order_id)
      const id = str(payment.id)
      const amount = num(payment.amount)
      if (orderId && id && amount !== undefined)
        await markPaymentCaptured({ gatewayOrderId: orderId, paymentId: id, amountPaise: amount })
      else outcome = "ignored"
    } else if (type === "payment.failed" && payment) {
      const orderId = str(payment.order_id)
      if (orderId)
        await markPaymentFailed({
          gatewayOrderId: orderId,
          errorCode: str(payment.error_code),
          errorDescription: str(payment.error_description),
        })
      else outcome = "ignored"
    } else if ((type === "refund.processed" || type === "refund.failed") && refund) {
      const id = str(refund.id)
      if (id)
        await Refund.updateOne(
          { gatewayRefundId: id },
          { $set: { status: type === "refund.processed" ? "processed" : "failed" } }
        )
      else outcome = "ignored"
    } else outcome = "ignored"

    await WebhookEvent.updateOne(
      { provider: "razorpay", eventId: input.eventId },
      { $set: { status: outcome } }
    )
    return { status: 200, body: { received: true } }
  } catch (error) {
    logger.error(
      { event: "webhook.failed", type, errorName: error instanceof Error ? error.name : "Unknown" },
      "Webhook processing failed"
    )
    await WebhookEvent.updateOne(
      { provider: "razorpay", eventId: input.eventId },
      {
        $set: {
          status: "failed",
          error: (error instanceof Error ? error.name : "Unknown").slice(0, 300),
        },
      }
    )
    return { status: 500, body: { error: "processing failed" } }
  }
}
