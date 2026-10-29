"use client"

import { ChoiceSelect } from "@/components/ui/choice-select"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  changeRoleAction,
  deleteReviewAction,
  moderateReviewAction,
  refundOrderAction,
  setCustomerStatusAction,
  voidSaleAction,
} from "@/features/admin/actions"

type Done = { ok: true } | { ok: false; message: string }

function useRun() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  async function run(action: () => Promise<Done>) {
    setBusy(true)
    setMessage("")
    const result = await action()
    setBusy(false)
    if (!result.ok) setMessage(result.message)
    else router.refresh()
  }
  return { busy, message, run }
}

export function StatusButton({
  userId,
  status,
  name,
}: {
  userId: string
  status: string
  name: string
}) {
  const { busy, message, run } = useRun()
  const suspend = status !== "suspended"
  return (
    <span className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        aria-label={`${suspend ? "Suspend" : "Restore"} ${name}`}
        onClick={() =>
          void run(() => setCustomerStatusAction(userId, suspend ? "suspended" : "active"))
        }
      >
        {suspend ? "Suspend" : "Restore"}
      </Button>
      <span role="alert" className="text-xs text-destructive">
        {message}
      </span>
    </span>
  )
}

export function RoleSelect({
  userId,
  role,
  roles,
  name,
}: {
  userId: string
  role: string
  roles: { value: string; label: string }[]
  name: string
}) {
  const { busy, message, run } = useRun()
  return (
    <span className="flex flex-col items-end gap-1">
      <ChoiceSelect
        aria-label={`Role for ${name}`}
        defaultValue={role}
        disabled={busy}
        className="h-9 w-auto min-w-40"
        onChange={(value) => void run(() => changeRoleAction(userId, value))}
      >
        {roles.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </ChoiceSelect>
      <span role="alert" className="text-xs text-destructive">
        {message}
      </span>
    </span>
  )
}

/** Money back to the customer. Each submit carries its own key so a double click refunds once. */
export function RefundForm({ orderNumber, maxRupees }: { orderNumber: string; maxRupees: string }) {
  const { busy, message, run } = useRun()
  const [amount, setAmount] = useState("")
  const [reason, setReason] = useState("")
  return (
    <form
      aria-label="Refund"
      className="flex max-w-xl flex-col gap-3 border p-4"
      onSubmit={(e) => {
        e.preventDefault()
        void run(() => refundOrderAction(orderNumber, amount, reason, crypto.randomUUID()))
      }}
    >
      <h2 className="text-xl">Refund</h2>
      <p className="text-sm text-muted-foreground">
        Up to ₹{maxRupees} can still be refunded. It goes back to the original payment method.
      </p>
      <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
        <div className="flex flex-col gap-1">
          <Label htmlFor="refund-amount" className="text-sm">
            Amount (₹)
          </Label>
          <Input
            id="refund-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="refund-reason" className="text-sm">
            Reason
          </Label>
          <Input id="refund-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      </div>
      <p role="alert" className="min-h-5 text-sm text-destructive">
        {message}
      </p>
      <div>
        <Button type="submit" disabled={busy}>
          Refund
        </Button>
      </div>
    </form>
  )
}

export function ReviewActions({ id, status }: { id: string; status: string }) {
  const { busy, message, run } = useRun()
  const [note, setNote] = useState("")
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        {status !== "approved" ? (
          <Button
            size="sm"
            disabled={busy}
            onClick={() => void run(() => moderateReviewAction(id, true, ""))}
          >
            Approve
          </Button>
        ) : null}
        {status !== "rejected" ? (
          <>
            <Input
              aria-label="Reason for refusing"
              placeholder="Reason for refusing"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-56"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void run(() => moderateReviewAction(id, false, note))}
            >
              Refuse
            </Button>
          </>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => void run(() => deleteReviewAction(id))}
        >
          Delete
        </Button>
      </div>
      <p role="alert" className="min-h-4 text-xs text-destructive">
        {message}
      </p>
    </div>
  )
}

/** Undoes a sale recorded by mistake: the stock goes back on the shelf. */
export function VoidSaleForm({ orderNumber }: { orderNumber: string }) {
  const { busy, message, run } = useRun()
  const [reason, setReason] = useState("")
  return (
    <form
      aria-label="Void this sale"
      className="flex max-w-xl flex-col gap-2 border p-4"
      onSubmit={(e) => {
        e.preventDefault()
        void run(() => voidSaleAction(orderNumber, reason))
      }}
    >
      <h2 className="text-xl">Void this sale</h2>
      <p className="text-sm text-muted-foreground">
        Use this if the sale was recorded by mistake. The items go back into stock and the order is
        cancelled. Give back any money outside the system.
      </p>
      <Label htmlFor="void-reason" className="text-sm">
        Why is it being voided?
      </Label>
      <div className="flex gap-2">
        <Input id="void-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        <Button type="submit" variant="destructive" disabled={busy}>
          Void sale
        </Button>
      </div>
      <p role="alert" className="min-h-5 text-sm text-destructive">
        {message}
      </p>
    </form>
  )
}
