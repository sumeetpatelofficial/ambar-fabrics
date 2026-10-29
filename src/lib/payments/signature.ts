import { createHmac } from "node:crypto"
import { safeEqual } from "@/lib/security/tokens"

const hmac = (secret: string, data: string) =>
  createHmac("sha256", secret).update(data).digest("hex")

/** Razorpay: HMAC-SHA256 of "order_id|payment_id" with the key secret. */
export function verifyCheckoutSignature(
  secret: string,
  gatewayOrderId: string,
  paymentId: string,
  signature: string
): boolean {
  return safeEqual(hmac(secret, `${gatewayOrderId}|${paymentId}`), signature)
}

/** Razorpay webhooks: HMAC-SHA256 of the exact raw request body with the webhook secret. */
export function verifyWebhookBody(secret: string, rawBody: string, signature: string): boolean {
  return safeEqual(hmac(secret, rawBody), signature)
}

export const signCheckout = (secret: string, orderId: string, paymentId: string) =>
  hmac(secret, `${orderId}|${paymentId}`)
export const signWebhook = (secret: string, rawBody: string) => hmac(secret, rawBody)
