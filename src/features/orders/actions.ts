"use server"

import { z } from "zod"
import { getSessionUser } from "@/lib/auth/session"
import { AppError } from "@/lib/errors"
import { getPaymentGateway } from "@/lib/payments"
import { MOCK_SECRET, recordMockPayment } from "@/lib/payments/mock"
import { signCheckout } from "@/lib/payments/signature"
import { getRequestContext } from "@/lib/request-context"
import { enforceRateLimit, type RateRule } from "@/lib/security/rate-limit"
import {
  cancelPendingOrder,
  createCheckout,
  previewCheckout,
  resumeCheckout,
  verifyBrowserPayment,
  type CheckoutPreview,
  type CheckoutSession,
} from "@/services/order-service"
import { Order } from "@/models/order"

const CHECKOUT: RateRule = { name: "checkout", limit: 30, windowSeconds: 10 * 60 }
const PREVIEW: RateRule = { name: "preview", limit: 120, windowSeconds: 10 * 60 }
const VERIFY: RateRule = { name: "payverify", limit: 30, windowSeconds: 10 * 60 }

export type ActionResult<T> = ({ ok: true } & T) | { ok: false; message: string }

const fail = (error: unknown): { ok: false; message: string } => ({
  ok: false,
  message:
    error instanceof AppError && error.status < 500
      ? error.message
      : error instanceof AppError && error.code.startsWith("PAYMENT")
        ? error.message
        : "Something went wrong. Please try again.",
})

async function signedIn(rule: RateRule) {
  const user = await getSessionUser()
  if (!user) return null
  const { ip } = await getRequestContext()
  await enforceRateLimit(rule, `user:${user.id}`, `ip:${ip}`)
  return user
}

const orderNumber = z.string().regex(/^[A-Z0-9-]{6,30}$/)
const couponCode = z.string().trim().max(40).optional()

export async function previewCheckoutAction(
  code?: string
): Promise<ActionResult<{ preview: CheckoutPreview }>> {
  try {
    const user = await signedIn(PREVIEW)
    if (!user) return { ok: false, message: "Please sign in to continue." }
    const parsed = couponCode.safeParse(code)
    return {
      ok: true,
      preview: await previewCheckout({
        userId: user.id,
        couponCode: parsed.success ? parsed.data : undefined,
      }),
    }
  } catch (error) {
    return fail(error)
  }
}

export async function startCheckoutAction(input: {
  addressId: string
  couponCode?: string
  idempotencyKey: string
}): Promise<ActionResult<{ session: CheckoutSession }>> {
  try {
    const user = await signedIn(CHECKOUT)
    if (!user) return { ok: false, message: "Please sign in to continue." }
    const parsed = z
      .object({
        addressId: z.string().length(24),
        couponCode,
        idempotencyKey: z.string().min(16).max(100),
      })
      .safeParse(input)
    if (!parsed.success) return { ok: false, message: "Please choose a delivery address." }
    return {
      ok: true,
      session: await createCheckout({ userId: user.id, email: user.email, ...parsed.data }),
    }
  } catch (error) {
    return fail(error)
  }
}

export async function resumePaymentAction(
  number: string
): Promise<ActionResult<{ session: CheckoutSession }>> {
  try {
    const user = await signedIn(CHECKOUT)
    const parsed = orderNumber.safeParse(number)
    if (!user || !parsed.success) return { ok: false, message: "Please sign in to continue." }
    return { ok: true, session: await resumeCheckout(user.id, parsed.data) }
  } catch (error) {
    return fail(error)
  }
}

/** The browser reports a finished payment. The server checks the signature and asks the gateway itself. */
export async function verifyPaymentAction(input: {
  orderNumber: string
  paymentId: string
  signature: string
}): Promise<ActionResult<{ outcome: string }>> {
  try {
    const user = await signedIn(VERIFY)
    const parsed = z
      .object({
        orderNumber,
        paymentId: z.string().min(5).max(60),
        signature: z.string().length(64),
      })
      .safeParse(input)
    if (!user || !parsed.success)
      return { ok: false, message: "We could not confirm that payment." }
    return { ok: true, outcome: await verifyBrowserPayment({ userId: user.id, ...parsed.data }) }
  } catch (error) {
    return fail(error)
  }
}

export async function cancelOrderAction(number: string): Promise<ActionResult<object>> {
  try {
    const user = await signedIn(CHECKOUT)
    const parsed = orderNumber.safeParse(number)
    if (!user || !parsed.success) return { ok: false, message: "Please sign in to continue." }
    await cancelPendingOrder(user.id, parsed.data)
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

/**
 * Development and browser tests only: pays an order on the stand-in gateway the way Razorpay's window would,
 * then runs the same verification as a real payment. It does nothing when real Razorpay keys are set.
 */
export async function payWithMockGatewayAction(
  number: string
): Promise<ActionResult<{ outcome: string }>> {
  try {
    const user = await signedIn(VERIFY)
    const parsed = orderNumber.safeParse(number)
    if (!user || !parsed.success) return { ok: false, message: "Please sign in to continue." }
    if (getPaymentGateway().name !== "mock") return { ok: false, message: "Not available." }
    const order = await Order.findOne({ orderNumber: parsed.data, userId: user.id }).lean()
    if (!order?.gatewayOrderId) return { ok: false, message: "We could not find that order." }
    const paymentId = `pay_mock_${Date.now().toString(36)}`
    recordMockPayment({
      id: paymentId,
      gatewayOrderId: order.gatewayOrderId,
      amountPaise: order.pricing.totalPaise,
      status: "captured",
    })
    const signature = signCheckout(MOCK_SECRET, order.gatewayOrderId, paymentId)
    return {
      ok: true,
      outcome: await verifyBrowserPayment({
        userId: user.id,
        orderNumber: parsed.data,
        paymentId,
        signature,
      }),
    }
  } catch (error) {
    return fail(error)
  }
}
