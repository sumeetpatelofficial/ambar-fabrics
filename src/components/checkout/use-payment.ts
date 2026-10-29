"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { mergeCartAction } from "@/features/cart/actions"
import { payWithMockGatewayAction, verifyPaymentAction } from "@/features/orders/actions"
import { useBag } from "@/stores/bag-store"
import type { CheckoutSession } from "@/services/order-service"

type RazorpayResponse = {
  razorpay_payment_id: string
  razorpay_order_id: string
  razorpay_signature: string
}
type RazorpayInstance = {
  open: () => void
  on: (
    event: "payment.failed",
    handler: (response: { error?: { description?: string } }) => void
  ) => void
}
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance
  }
}

let scriptPromise: Promise<void> | null = null
function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve()
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script")
    script.src = "https://checkout.razorpay.com/v1/checkout.js"
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      scriptPromise = null
      reject(new Error("load"))
    }
    document.head.appendChild(script)
  })
  return scriptPromise
}

export type PaymentState =
  { status: "idle" } | { status: "working" } | { status: "problem"; message: string }

/** Opens the payment window for an order and, once the customer has paid, has the server confirm it. */
export function usePayment(siteName: string) {
  const router = useRouter()
  const [state, setState] = useState<PaymentState>({ status: "idle" })

  /** The paid items have left the saved bag; bring this browser's copy in line before moving on. */
  async function refreshBag() {
    const result = await mergeCartAction([])
    if (result.ok) useBag.getState().replace(result.lines)
  }

  async function confirmed(orderNumber: string, paymentId: string, signature: string) {
    const result = await verifyPaymentAction({ orderNumber, paymentId, signature })
    if (!result.ok) {
      setState({ status: "problem", message: result.message })
      return
    }
    await refreshBag()
    router.push(`/account/orders/${orderNumber}?paid=1`)
  }

  async function pay(session: CheckoutSession) {
    setState({ status: "working" })
    if (session.gateway === "mock") {
      const result = await payWithMockGatewayAction(session.orderNumber)
      if (!result.ok) setState({ status: "problem", message: result.message })
      else {
        await refreshBag()
        router.push(`/account/orders/${session.orderNumber}?paid=1`)
      }
      return
    }
    try {
      await loadRazorpay()
    } catch {
      setState({
        status: "problem",
        message: "The payment window could not load. Check your connection and try again.",
      })
      return
    }
    const rzp = new window.Razorpay!({
      key: session.publicKey,
      amount: session.amountPaise,
      currency: "INR",
      order_id: session.gatewayOrderId,
      name: siteName,
      prefill: session.prefill,
      handler: (response: RazorpayResponse) =>
        void confirmed(
          session.orderNumber,
          response.razorpay_payment_id,
          response.razorpay_signature
        ),
      modal: {
        ondismiss: () =>
          setState({
            status: "problem",
            message: "The payment was not completed. You have not been charged. You can try again.",
          }),
      },
    })
    rzp.on("payment.failed", (response) =>
      setState({
        status: "problem",
        message: response.error?.description ?? "The payment did not go through. Please try again.",
      })
    )
    rzp.open()
  }

  return { state, pay, reset: () => setState({ status: "idle" }) }
}
