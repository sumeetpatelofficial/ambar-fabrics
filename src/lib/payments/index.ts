import "server-only"
import { ConfigError } from "@/lib/errors"
import { getServerEnv, isGroupConfigured, requireGroup } from "@/lib/env/server"
import { createMockGateway } from "@/lib/payments/mock"
import { createRazorpayGateway } from "@/lib/payments/razorpay"
import type { PaymentGateway } from "@/lib/payments/types"

/**
 * Razorpay when its keys are set. Without them the mock is used in development and in the browser-test
 * server only; a production deployment with no keys refuses to take payments rather than pretend.
 */
export function getPaymentGateway(): PaymentGateway {
  const env = getServerEnv()
  if (isGroupConfigured("razorpay")) {
    const k = requireGroup("razorpay")
    return createRazorpayGateway({
      keyId: k.RAZORPAY_KEY_ID,
      keySecret: k.RAZORPAY_KEY_SECRET,
      webhookSecret: k.RAZORPAY_WEBHOOK_SECRET,
    })
  }
  if (env.NODE_ENV !== "production" || process.env.ENABLE_DEV_PAGES === "1")
    return createMockGateway()
  throw new ConfigError("Payments are not configured.", [
    "RAZORPAY_KEY_ID",
    "RAZORPAY_KEY_SECRET",
    "RAZORPAY_WEBHOOK_SECRET",
  ])
}
