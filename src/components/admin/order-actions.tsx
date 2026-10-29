"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  bookShipmentAction,
  cancelShipmentAction,
  decideReturnAction,
  receiveReturnAction,
  staffCancelOrderAction,
  type Done,
} from "@/features/fulfilment/actions"

/** The staff buttons for one order. The server checks the permission again on every click. */
export function AdminOrderActions({
  orderNumber,
  canBook,
  canCancelShipment,
  canCancelOrder,
  returns,
}: {
  orderNumber: string
  canBook: boolean
  canCancelShipment: boolean
  canCancelOrder: boolean
  returns: { id: string; status: string; reason: string }[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [reason, setReason] = useState("")
  const [note, setNote] = useState("")

  async function run(action: () => Promise<Done>) {
    setBusy(true)
    setMessage("")
    const result = await action()
    setBusy(false)
    if (!result.ok) setMessage(result.message)
    else router.refresh()
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-3">
        {canBook ? (
          <Button disabled={busy} onClick={() => void run(() => bookShipmentAction(orderNumber))}>
            Book courier
          </Button>
        ) : null}
        {canCancelShipment ? (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void run(() => cancelShipmentAction(orderNumber))}
          >
            Cancel shipment
          </Button>
        ) : null}
      </div>

      {canCancelOrder ? (
        <div className="flex max-w-xl flex-col gap-2">
          <Label htmlFor="cancel-reason" className="text-sm">
            Cancel this order and refund in full
          </Label>
          <div className="flex gap-2">
            <Input
              id="cancel-reason"
              placeholder="Reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => void run(() => staffCancelOrderAction(orderNumber, reason))}
            >
              Cancel order
            </Button>
          </div>
        </div>
      ) : null}

      {returns.length > 0 ? (
        <section aria-labelledby="admin-returns" className="flex flex-col gap-3">
          <h2 id="admin-returns" className="text-xl">
            Returns
          </h2>
          {returns.map((r) => (
            <div key={r.id} className="flex flex-col gap-2 border p-3 text-sm">
              <p>
                <span className="font-medium">{r.status}</span>: {r.reason}
              </p>
              {r.status === "requested" ? (
                <div className="flex flex-wrap items-end gap-2">
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => void run(() => decideReturnAction(orderNumber, r.id, true, ""))}
                  >
                    Approve
                  </Button>
                  <div className="flex gap-2">
                    <Input
                      aria-label="Reason for refusing"
                      placeholder="Reason for refusing"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void run(() => decideReturnAction(orderNumber, r.id, false, note))
                      }
                    >
                      Refuse
                    </Button>
                  </div>
                </div>
              ) : null}
              {r.status === "approved" ? (
                <div>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => void run(() => receiveReturnAction(orderNumber, r.id))}
                  >
                    Mark received and refund
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}
      <p role="alert" className="min-h-5 text-sm text-destructive">
        {message}
      </p>
    </div>
  )
}
