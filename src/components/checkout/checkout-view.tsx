"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { ShoppingBag } from "lucide-react"
import { TrackBeginCheckout } from "@/components/analytics/track-events"
import { events, lineItem } from "@/lib/analytics/events"
import { track } from "@/lib/analytics/track"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/storefront/empty-state"
import { usePayment } from "@/components/checkout/use-payment"
import {
  cancelOrderAction,
  previewCheckoutAction,
  startCheckoutAction,
} from "@/features/orders/actions"
import { formatQuantity } from "@/lib/measure"
import { formatPaise } from "@/lib/money"
import type { AddressDTO } from "@/services/account-service"
import type { CheckoutPreview, CheckoutSession } from "@/services/order-service"

type Props = { addresses: AddressDTO[]; siteName: string }

const newKey = () => crypto.randomUUID().replaceAll("-", "")

export function CheckoutView({ addresses, siteName }: Props) {
  const [addressId, setAddressId] = useState(addresses[0]?.id ?? "")
  const [couponInput, setCouponInput] = useState("")
  const [applied, setApplied] = useState("")
  const [preview, setPreview] = useState<CheckoutPreview | null | undefined>(undefined)
  const [error, setError] = useState("")
  const { state, pay, reset } = usePayment(siteName)
  // One order per set of choices: paying again after a closed window reuses it, changing a choice starts fresh.
  const session = useRef<{ value: CheckoutSession; addressId: string; coupon: string } | null>(null)
  const key = useRef(newKey())

  useEffect(() => {
    let current = true
    void previewCheckoutAction(applied).then((r) => {
      if (!current) return
      if (r.ok) setPreview(r.preview)
      else {
        setPreview(null)
        setError(r.message)
      }
    })
    return () => {
      current = false
    }
  }, [applied])

  async function discardOpenOrder() {
    const open = session.current
    session.current = null
    key.current = newKey()
    if (open) await cancelOrderAction(open.value.orderNumber)
  }

  async function submit() {
    setError("")
    reset()
    if (!addressId) {
      setError("Choose a delivery address.")
      return
    }
    if (preview) {
      const items = preview.cart.lines.map((l) => lineItem(l))
      track(events.addShippingInfo(items, "Standard", preview.couponCode ?? undefined))
      track(events.addPaymentInfo(items, "Razorpay", preview.couponCode ?? undefined))
    }
    const code = preview?.couponCode ?? ""
    if (
      session.current &&
      (session.current.addressId !== addressId || session.current.coupon !== code)
    )
      await discardOpenOrder()
    if (!session.current) {
      const result = await startCheckoutAction({
        addressId,
        couponCode: code || undefined,
        idempotencyKey: key.current,
      })
      if (!result.ok) {
        setError(result.message)
        return
      }
      session.current = { value: result.session, addressId, coupon: code }
    }
    await pay(session.current.value)
  }

  if (preview === undefined) return <CheckoutSkeleton />
  if (preview === null || preview.cart.lines.length === 0) {
    return (
      <EmptyState
        icon={ShoppingBag}
        title={preview === null ? "We could not load checkout" : "Your bag is empty"}
        description={preview === null ? error : "Add something to your bag to check out."}
        action={
          <Link href={preview === null ? "/cart" : "/shop"} className={buttonVariants()}>
            {preview === null ? "Back to your bag" : "Browse products"}
          </Link>
        }
      />
    )
  }
  const { cart, totals } = preview
  const working = state.status === "working"
  const problem = error || (state.status === "problem" ? state.message : "")

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_24rem]">
      <TrackBeginCheckout lines={cart.lines.filter((l) => l.status === "ok")} />
      <div className="flex flex-col gap-10">
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-2xl">Delivery address</legend>
          {addresses.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You have no saved address yet.{" "}
              <Link href="/account/addresses" className="underline underline-offset-4">
                Add one
              </Link>{" "}
              and come back to your bag.
            </p>
          ) : (
            addresses.map((a) => (
              <label
                key={a.id}
                className="flex cursor-pointer gap-3 border p-4 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
              >
                <input
                  type="radio"
                  name="address"
                  value={a.id}
                  checked={addressId === a.id}
                  onChange={() => setAddressId(a.id)}
                  className="mt-1"
                />
                <span className="text-sm leading-relaxed">
                  <span className="block font-medium">
                    {a.fullName}
                    {a.isDefault ? " (default)" : ""}
                  </span>
                  {[a.line1, a.line2, a.landmark].filter(Boolean).join(", ")}
                  <br />
                  {a.city}, {a.state} {a.pincode}
                  <br />
                  Phone {a.phone}
                </span>
              </label>
            ))
          )}
        </fieldset>

        <div className="flex flex-col gap-2">
          <h2 className="text-2xl">Discount code</h2>
          <form
            className="flex max-w-sm gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              setError("")
              setPreview(undefined)
              setApplied(couponInput.trim())
            }}
          >
            <div className="flex-1">
              <Label htmlFor="coupon" className="sr-only">
                Discount code
              </Label>
              <Input
                id="coupon"
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value)}
                autoComplete="off"
                className="uppercase"
              />
            </div>
            <Button type="submit" variant="outline" disabled={working}>
              Apply
            </Button>
          </form>
          {preview.couponMessage ? (
            <p role="alert" className="text-sm text-destructive">
              {preview.couponMessage}
            </p>
          ) : preview.couponCode ? (
            <p role="status" className="text-sm text-primary">
              {preview.couponCode} applied.
            </p>
          ) : null}
        </div>
      </div>

      <aside aria-label="Order summary" className="h-fit border p-6 lg:sticky lg:top-24">
        <h2 className="text-xl">Your order</h2>
        <ul className="mt-4 flex flex-col gap-3 text-sm">
          {cart.lines.map((l) => (
            <li key={l.variantId} className="flex justify-between gap-4">
              <span>
                {l.name}
                <span className="block text-muted-foreground">
                  {l.status === "ok" ? formatQuantity(l.unit, l.qty) : l.message}
                </span>
              </span>
              <span className="tabular">
                {l.status === "ok" ? formatPaise(l.linePaise) : "Not counted"}
              </span>
            </li>
          ))}
        </ul>
        <dl className="tabular mt-4 flex flex-col gap-2 border-t pt-4 text-sm">
          <Row label="Subtotal" value={formatPaise(totals.subtotalPaise)} />
          {totals.discountPaise > 0 ? (
            <Row label="Discount" value={`-${formatPaise(totals.discountPaise)}`} />
          ) : null}
          <Row
            label="Shipping"
            value={totals.shippingPaise === 0 ? "Free" : formatPaise(totals.shippingPaise)}
          />
          {totals.taxExclusive ? <Row label="Tax" value={formatPaise(totals.taxPaise)} /> : null}
          <div className="flex justify-between gap-4 border-t pt-3 text-base font-medium">
            <dt>Total</dt>
            <dd>{formatPaise(totals.totalPaise)}</dd>
          </div>
        </dl>
        {!cart.canCheckout ? (
          <p role="alert" className="mt-4 text-sm text-destructive">
            Some items need attention.{" "}
            <Link href="/cart" className="underline underline-offset-4">
              Review your bag
            </Link>
          </p>
        ) : null}
        <p role="alert" className="mt-4 min-h-5 text-sm text-destructive">
          {problem}
        </p>
        <Button
          size="lg"
          className="mt-2 w-full"
          disabled={!cart.canCheckout || working || addresses.length === 0}
          onClick={() => void submit()}
        >
          {working ? "Opening payment" : `Pay ${formatPaise(totals.totalPaise)}`}
        </Button>
        <p className="mt-3 text-xs text-muted-foreground">
          Payments are handled by Razorpay. Fabric is cut to your length, so cut pieces cannot be
          returned.
        </p>
      </aside>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function CheckoutSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading checkout"
      className="grid gap-10 lg:grid-cols-[1fr_24rem]"
    >
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
      <Skeleton className="h-96 w-full" />
    </div>
  )
}
