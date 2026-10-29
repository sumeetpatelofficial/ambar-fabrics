"use client"

import Link from "next/link"
import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"
import { TrackViewCart } from "@/components/analytics/track-events"
import { events, lineItem } from "@/lib/analytics/events"
import { track } from "@/lib/analytics/track"
import { Button, buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/storefront/empty-state"
import { PriceTag } from "@/components/storefront/price-tag"
import { ProductArt } from "@/components/storefront/product-art"
import {
  getPricedCartAction,
  removeFromCartAction,
  setCartQuantityAction,
} from "@/features/cart/actions"
import type { CartLineView, PricedCart } from "@/features/cart/types"
import { stepQuantity } from "@/features/catalog/purchase"
import { formatQuantity } from "@/lib/measure"
import { formatPaise } from "@/lib/money"
import { useBag } from "@/stores/bag-store"

type Loaded = { key: string; cart: PricedCart | null }

/**
 * The bag page. The browser only knows which items and how much; names, prices, limits and totals all
 * come from the server, which reads them from the catalogue every time.
 */
export function CartView() {
  const hydrated = useBag((s) => s.hydrated)
  const synced = useBag((s) => s.synced)
  const lines = useBag((s) => s.lines)
  const { status } = useSession()
  const waiting = status === "loading" || (status === "authenticated" && !synced)
  const key = lines.map((l) => `${l.variantId}:${l.qty}`).join(",")
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    if (!hydrated || waiting || lines.length === 0) return
    let current = true
    void getPricedCartAction(lines).then((cart) => {
      if (current) setLoaded({ key, cart })
    })
    return () => {
      current = false
    }
    // `key` stands for the lines; the array identity changes on every store update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, waiting, key, attempt])

  async function change(line: CartLineView, qty: number | null) {
    if (status === "authenticated") {
      setBusy(line.variantId)
      const result =
        qty === null
          ? await removeFromCartAction(line.variantId)
          : await setCartQuantityAction(line.variantId, qty)
      setBusy(null)
      if (!result.ok) {
        toast.error("We could not change your bag", { description: result.message })
        return
      }
      useBag.getState().replace(result.lines)
      if (qty === null) track(events.removeFromCart(lineItem(line)))
    } else if (qty === null) {
      useBag.getState().remove(line.variantId)
      track(events.removeFromCart(lineItem(line)))
    } else {
      useBag.getState().setQty(line.variantId, qty)
    }
  }

  if (!hydrated || waiting) return <CartSkeleton />
  if (lines.length === 0) {
    return (
      <EmptyState
        icon={ShoppingBag}
        title="Your bag is empty"
        description="Fabric is sold by the length you choose. Find something you like and add it here."
        action={
          <Link href="/shop" className={buttonVariants()}>
            Browse products
          </Link>
        }
      />
    )
  }
  const cart = loaded?.key === key ? loaded.cart : undefined
  if (cart === undefined) return <CartSkeleton />
  if (cart === null) {
    return (
      <EmptyState
        title="We could not load your bag"
        description="Please check your connection and try again."
        action={
          <Button
            variant="outline"
            onClick={() => {
              setLoaded(null)
              setAttempt((n) => n + 1)
            }}
          >
            Try again
          </Button>
        }
      />
    )
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_22rem]">
      <TrackViewCart lines={cart.lines.filter((l) => l.status === "ok")} />
      <section aria-labelledby="bag-items">
        <h2 id="bag-items" className="sr-only">
          Items in your bag
        </h2>
        <ul className="space-y-4">
          {cart.lines.map((line) => (
            <CartLine
              key={line.variantId}
              line={line}
              busy={busy === line.variantId}
              onChange={(qty) => void change(line, qty)}
            />
          ))}
        </ul>
      </section>

      <aside
        aria-label="Order summary"
        className="h-fit rounded-md border p-6 shadow-md lg:sticky lg:top-24"
      >
        <h2 className="text-2xl font-medium">Summary</h2>
        <dl className="tabular mt-4 flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt>
              Subtotal ({cart.itemCount} {cart.itemCount === 1 ? "item" : "items"})
            </dt>
            <dd className="font-medium">{formatPaise(cart.subtotalPaise)}</dd>
          </div>
        </dl>
        <p className="mt-2 text-sm text-muted-foreground">
          Taxes and shipping are added at checkout.
        </p>
        {!cart.canCheckout ? (
          <p role="status" className="mt-4 text-sm text-destructive">
            Fix the items marked above to continue.
          </p>
        ) : null}
        {status === "unauthenticated" ? (
          <Link
            href="/login?next=%2Fcart"
            className={buttonVariants({ size: "lg", className: "mt-6 w-full" })}
          >
            Sign in to check out
          </Link>
        ) : (
          <Link
            href="/checkout"
            aria-disabled={!cart.canCheckout}
            className={buttonVariants({
              size: "lg",
              className: cn("mt-6 w-full", !cart.canCheckout && "pointer-events-none opacity-50"),
            })}
          >
            Check out
          </Link>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Fabric is cut to your length, so cut pieces cannot be returned.
        </p>
      </aside>
    </div>
  )
}

function CartLine({
  line,
  busy,
  onChange,
}: {
  line: CartLineView
  busy: boolean
  onChange: (qty: number | null) => void
}) {
  const ok = line.status === "ok"
  const unavailable = line.status === "unavailable"
  const { unit } = line
  const detail = [line.colorName, line.size].filter(Boolean).join(", ")
  const heading = unavailable ? (
    <span>{line.name}</span>
  ) : (
    <Link href={`/products/${line.slug}`} className="underline-offset-4 hover:underline">
      {line.name}
    </Link>
  )
  return (
    <li className="grid grid-cols-[5.5rem_1fr] gap-4 rounded-md border px-6 py-6 sm:grid-cols-[7rem_1fr_auto]">
      <div className="relative aspect-square overflow-hidden bg-muted">
        {unavailable ? null : (
          <ProductArt
            product={{
              name: line.name,
              swatches: line.colorHex ? [{ name: line.colorName ?? "", hex: line.colorHex }] : [],
            }}
            image={line.image ?? null}
            sizes="7rem"
          />
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <h3 className="text-xl leading-snug">{heading}</h3>
        {detail ? <p className="text-sm text-muted-foreground">{detail}</p> : null}
        {unavailable ? null : (
          <PriceTag
            pricePaise={line.unitPricePaise}
            comparePaise={line.comparePaise}
            unitLabel={line.unitLabel}
            className="text-sm"
          />
        )}
        {line.message ? (
          <p role="alert" className="text-sm text-destructive">
            {line.message}
          </p>
        ) : null}
        <div className="mt-1 flex flex-wrap items-center gap-3">
          {unavailable ? null : (
            <div role="group" aria-label={`Quantity of ${line.name}`} className="flex items-center">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={`Reduce ${line.name}`}
                disabled={busy || line.qty <= unit.minQty}
                onClick={() => onChange(stepQuantity(unit, line.qty, -1, line.maxOrderable))}
              >
                <Minus aria-hidden="true" className="size-4" />
              </Button>
              <span className="tabular min-w-20 px-3 text-center text-sm">
                {formatQuantity(unit, line.qty)}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={`Increase ${line.name}`}
                disabled={busy || line.qty + unit.stepQty > line.maxOrderable}
                onClick={() => onChange(stepQuantity(unit, line.qty, 1, line.maxOrderable))}
              >
                <Plus aria-hidden="true" className="size-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
      <div className="col-span-2 flex items-start justify-between gap-3 sm:col-span-1 sm:flex-col sm:items-end">
        <p className="tabular text-right font-medium sm:text-base">
          {ok ? formatPaise(line.linePaise) : "Not counted"}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-mr-2.5"
          disabled={busy}
          onClick={() => onChange(null)}
          aria-label={`Remove ${line.name}`}
        >
          <Trash2 aria-hidden="true" className="size-4" /> Remove
        </Button>
      </div>
    </li>
  )
}

function CartSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading your bag"
      className="grid gap-10 lg:grid-cols-[1fr_22rem]"
    >
      <div className="flex flex-col gap-6">
        {Array.from({ length: 2 }, (_, i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
      <Skeleton className="h-56 w-full" />
    </div>
  )
}
