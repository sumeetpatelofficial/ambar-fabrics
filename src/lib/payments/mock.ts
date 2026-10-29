import { randomBytes } from "node:crypto"
import { verifyCheckoutSignature, verifyWebhookBody } from "@/lib/payments/signature"
import type { GatewayPayment, PaymentGateway } from "@/lib/payments/types"

/** Development and test stand-in with the same signatures as Razorpay. Never used in production. */
export const MOCK_SECRET = "mock-gateway-secret-not-for-production"

const seen = new Map<string, GatewayPayment>()

export function createMockGateway(): PaymentGateway {
  return {
    name: "mock",
    publicKey: "mock_key",
    async createOrder() {
      return { gatewayOrderId: `order_mock_${randomBytes(8).toString("hex")}` }
    },
    verifyPaymentSignature: ({ gatewayOrderId, paymentId, signature }) =>
      verifyCheckoutSignature(MOCK_SECRET, gatewayOrderId, paymentId, signature),
    verifyWebhookSignature: (rawBody, signature) =>
      verifyWebhookBody(MOCK_SECRET, rawBody, signature),
    async fetchPayment(paymentId) {
      const known = seen.get(paymentId)
      if (known) return known
      return { id: paymentId, gatewayOrderId: "", amountPaise: 0, status: "created" }
    },
    async fetchOrderPayments(gatewayOrderId) {
      return [...seen.values()].filter((p) => p.gatewayOrderId === gatewayOrderId)
    },
    async refund() {
      return { gatewayRefundId: `rfnd_mock_${randomBytes(8).toString("hex")}`, status: "processed" }
    },
  }
}

/** Test and development hook: records a payment the mock gateway should report as made. */
export function recordMockPayment(payment: GatewayPayment) {
  seen.set(payment.id, payment)
}
