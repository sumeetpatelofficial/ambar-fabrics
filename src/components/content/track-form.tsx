"use client"

import { startTransition, useActionState, useState } from "react"
import { SubmitButton } from "@/components/forms/submit-button"
import { TextField } from "@/components/forms/text-field"
import { OrderTracking } from "@/components/orders/order-tracking"
import { statusLabel } from "@/components/orders-status"
import { trackOrderAction, type TrackState } from "@/features/content/actions"

const initial: TrackState = { status: "idle" }

export function TrackForm() {
  const [state, action, pending] = useActionState(trackOrderAction, initial)
  // Controlled, so a form reset after the answer cannot wipe what the person typed.
  const [orderNumber, setOrderNumber] = useState("")
  const [email, setEmail] = useState("")
  return (
    <div className="flex flex-col gap-8">
      <form
        // Not `action={...}`: React clears a form once its action finishes, which would empty the boxes after "not found".
        onSubmit={(e) => {
          e.preventDefault()
          const data = new FormData(e.currentTarget)
          startTransition(() => action(data))
        }}
        noValidate
        aria-label="Track an order"
        className="flex max-w-xl flex-col gap-4"
      >
        {state.status === "error" ? (
          <p
            role="alert"
            className="border border-destructive/40 bg-destructive/5 px-4 py-3 text-destructive"
          >
            {state.message}
          </p>
        ) : null}
        <TextField
          name="orderNumber"
          label="Order number"
          placeholder="AM-2610-000001"
          autoComplete="off"
          required
          value={orderNumber}
          onChange={(e) => setOrderNumber(e.target.value)}
        />
        <TextField
          name="email"
          label="Email address on the order"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div>
          <SubmitButton pending={pending} pendingLabel="Looking">
            Track order
          </SubmitButton>
        </div>
      </form>
      {state.status === "found" ? (
        <section aria-labelledby="found" className="flex max-w-xl flex-col gap-4 border p-5">
          <h2 id="found" className="text-2xl">
            Order {state.order.orderNumber}
          </h2>
          <p role="status" className="text-lg">
            {statusLabel(state.order).label}
          </p>
          <ul className="text-sm text-muted-foreground">
            {state.order.items.map((i) => (
              <li key={`${i.name}-${i.quantity}`}>
                {i.name}, {i.quantity}
              </li>
            ))}
          </ul>
          {state.order.shipment ? (
            <OrderTracking shipment={state.order.shipment} />
          ) : (
            <p className="text-sm text-muted-foreground">
              It has not been handed to the courier yet.
            </p>
          )}
        </section>
      ) : null}
    </div>
  )
}
