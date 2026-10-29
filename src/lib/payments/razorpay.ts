import { AppError } from "@/lib/errors"
import { verifyCheckoutSignature, verifyWebhookBody } from "@/lib/payments/signature"
import type { GatewayPayment, PaymentGateway } from "@/lib/payments/types"

type Config = { keyId: string; keySecret: string; webhookSecret: string; baseUrl?: string }

type RzpPayment = { id: string; order_id: string; amount: number; status: string }

const STATUS: Record<string, GatewayPayment["status"]> = {
  created: "created",
  authorized: "authorized",
  captured: "captured",
  failed: "failed",
  refunded: "refunded",
}
const toPayment = (p: RzpPayment): GatewayPayment => ({
  id: p.id,
  gatewayOrderId: p.order_id,
  amountPaise: p.amount,
  status: STATUS[p.status] ?? "created",
})

/** Razorpay over its REST API (no SDK): fewer dependencies, and every call is visible here. */
export function createRazorpayGateway(
  config: Config,
  fetchImpl: typeof fetch = fetch
): PaymentGateway {
  const base = config.baseUrl ?? "https://api.razorpay.com/v1"
  const auth = `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64")}`

  async function call<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    headers: Record<string, string> = {}
  ) {
    let response: Response
    try {
      response = await fetchImpl(`${base}${path}`, {
        method,
        headers: { Authorization: auth, "Content-Type": "application/json", ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      })
    } catch {
      throw new AppError(
        "PAYMENT_UNAVAILABLE",
        "The payment service is not responding. Please try again.",
        503
      )
    }
    if (!response.ok) {
      // The gateway's message can be shown to staff in logs; the customer gets a generic one.
      throw new AppError(
        "PAYMENT_ERROR",
        "We could not complete that with the payment service.",
        502,
        {
          status: response.status,
        }
      )
    }
    return (await response.json()) as T
  }

  return {
    name: "razorpay",
    publicKey: config.keyId,
    async createOrder({ amountPaise, receipt, notes }) {
      const order = await call<{ id: string }>("POST", "/orders", {
        amount: amountPaise,
        currency: "INR",
        receipt,
        notes,
      })
      return { gatewayOrderId: order.id }
    },
    verifyPaymentSignature: ({ gatewayOrderId, paymentId, signature }) =>
      verifyCheckoutSignature(config.keySecret, gatewayOrderId, paymentId, signature),
    verifyWebhookSignature: (rawBody, signature) =>
      verifyWebhookBody(config.webhookSecret, rawBody, signature),
    async fetchPayment(paymentId) {
      return toPayment(await call<RzpPayment>("GET", `/payments/${encodeURIComponent(paymentId)}`))
    },
    async fetchOrderPayments(gatewayOrderId) {
      const list = await call<{ items: RzpPayment[] }>(
        "GET",
        `/orders/${encodeURIComponent(gatewayOrderId)}/payments`
      )
      return list.items.map(toPayment)
    },
    async refund({ paymentId, amountPaise, idempotencyKey, notes }) {
      const refund = await call<{ id: string; status: string }>(
        "POST",
        `/payments/${encodeURIComponent(paymentId)}/refund`,
        { amount: amountPaise, notes },
        { "X-Refund-Idempotency": idempotencyKey }
      )
      return {
        gatewayRefundId: refund.id,
        status: refund.status === "processed" ? "processed" : "pending",
      }
    },
  }
}
