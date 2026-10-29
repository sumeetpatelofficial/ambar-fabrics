"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { usePayment } from "@/components/checkout/use-payment"
import { cancelOrderAction, resumePaymentAction } from "@/features/orders/actions"
import { formatPaise } from "@/lib/money"

/** For an order still waiting for payment: finish paying, or give it up and release the items. */
export function OrderPayActions({
  orderNumber,
  totalPaise,
  siteName,
}: {
  orderNumber: string
  totalPaise: number
  siteName: string
}) {
  const router = useRouter()
  const { state, pay, reset } = usePayment(siteName)
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)

  async function resume() {
    setMessage("")
    reset()
    const result = await resumePaymentAction(orderNumber)
    if (!result.ok) {
      setMessage(result.message)
      router.refresh()
      return
    }
    await pay(result.session)
  }

  async function cancel() {
    setBusy(true)
    const result = await cancelOrderAction(orderNumber)
    setBusy(false)
    if (!result.ok) setMessage(result.message)
    else router.refresh()
  }

  const problem = message || (state.status === "problem" ? state.message : "")
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <Button
          size="lg"
          disabled={busy || state.status === "working"}
          onClick={() => void resume()}
        >
          Pay {formatPaise(totalPaise)}
        </Button>
        <Button
          variant="outline"
          size="lg"
          disabled={busy || state.status === "working"}
          onClick={() => void cancel()}
        >
          Cancel order
        </Button>
      </div>
      <p role="alert" className="min-h-5 text-sm text-destructive">
        {problem}
      </p>
    </div>
  )
}
