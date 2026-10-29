"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cancelMyOrderAction, requestReturnAction } from "@/features/fulfilment/actions"
import { baseToDisplayString } from "@/lib/measure"
import type { OrderDetail } from "@/services/order-detail-service"

/** Cancel a paid order that has not been prepared yet. */
export function CancelOrder({ orderNumber }: { orderNumber: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")

  async function cancel() {
    setBusy(true)
    const result = await cancelMyOrderAction(orderNumber, "Cancelled by customer")
    setBusy(false)
    if (!result.ok) setMessage(result.message)
    else router.refresh()
  }

  return (
    <div className="flex flex-col gap-2">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm">Cancel this order and refund the full amount?</p>
          <Button variant="destructive" disabled={busy} onClick={() => void cancel()}>
            Yes, cancel order
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => setConfirming(false)}>
            Keep it
          </Button>
        </div>
      ) : (
        <div>
          <Button variant="outline" onClick={() => setConfirming(true)}>
            Cancel order
          </Button>
        </div>
      )}
      <p role="alert" className="min-h-5 text-sm text-destructive">
        {message}
      </p>
    </div>
  )
}

/** Choose how many of each returnable item to send back, and why. */
export function ReturnForm({
  orderNumber,
  items,
  endsOn,
}: {
  orderNumber: string
  items: OrderDetail["returnable"]
  endsOn?: string
}) {
  const router = useRouter()
  const [qty, setQty] = useState<Record<string, string>>({})
  const [reason, setReason] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const chosen = items
      .map((i) => ({
        variantId: i.variantId,
        qty: Number.parseInt(qty[i.variantId] ?? "0", 10) || 0,
      }))
      .filter((i) => i.qty > 0)
    if (chosen.length === 0) {
      setMessage("Choose how many of at least one item to return.")
      return
    }
    setBusy(true)
    const result = await requestReturnAction(orderNumber, chosen, reason)
    setBusy(false)
    if (!result.ok) setMessage(result.message)
    else router.refresh()
  }

  return (
    <form onSubmit={submit} className="flex max-w-xl flex-col gap-4 border p-5">
      <h2 className="text-xl">Return an item</h2>
      {endsOn ? (
        <p className="text-sm text-muted-foreground">
          You can ask for a return until{" "}
          {new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeZone: "Asia/Kolkata" }).format(
            new Date(endsOn)
          )}
          .
        </p>
      ) : null}
      {items.map((i) => (
        <div key={i.variantId} className="flex items-center justify-between gap-4">
          <Label htmlFor={`ret-${i.variantId}`} className="text-sm">
            {i.name}
            <span className="block font-normal text-muted-foreground">
              up to {baseToDisplayString(i.unit, i.left)}
            </span>
          </Label>
          <Input
            id={`ret-${i.variantId}`}
            inputMode="numeric"
            className="w-20 text-center"
            value={qty[i.variantId] ?? ""}
            placeholder="0"
            onChange={(e) => setQty({ ...qty, [i.variantId]: e.target.value.replace(/\D/g, "") })}
          />
        </div>
      ))}
      <div className="flex flex-col gap-1">
        <Label htmlFor="return-reason" className="text-sm">
          Why are you returning it?
        </Label>
        <Input
          id="return-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
        />
      </div>
      <p role="alert" className="min-h-5 text-sm text-destructive">
        {message}
      </p>
      <div>
        <Button type="submit" disabled={busy}>
          Ask for a return
        </Button>
      </div>
    </form>
  )
}
