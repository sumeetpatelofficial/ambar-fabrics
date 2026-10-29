"use client"

import { Minus, Plus, ShoppingBag } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { useAddToBag } from "@/components/storefront/use-add-to-bag"
import { remainingOrderable, stepQuantity } from "@/features/catalog/purchase"
import type { QuickVariantDTO } from "@/features/catalog/types"
import { baseToDisplayString, parseDisplayQuantity, validateQuantity } from "@/lib/measure"
import { useBag } from "@/stores/bag-store"

/**
 * Pick an option, set how much, and add it to the bag without leaving the list. The same rules as the
 * product page apply (minimum, steps, what is in stock and already in the bag), and the server checks
 * them again when it saves.
 */
export function QuickAdd({
  slug,
  name,
  variants,
}: {
  slug: string
  name: string
  variants: QuickVariantDTO[]
}) {
  const first = variants.find((v) => v.availability.status !== "out_of_stock") ?? variants[0]
  const [variantId, setVariantId] = useState(first?.id ?? "")
  const variant = variants.find((v) => v.id === variantId) ?? first
  const [text, setText] = useState(() =>
    variant ? baseToDisplayString(variant.unit, variant.unit.minQty) : ""
  )
  const [announcement, setAnnouncement] = useState("")
  const { add, adding, waiting } = useAddToBag({ slug, name })
  const inBag = useBag((s) => (s.hydrated && variant ? s.qtyOf(variant.id) : 0))

  if (!variant) return null
  const { unit } = variant
  const soldOut = variant.availability.status === "out_of_stock"
  const max = remainingOrderable(unit, variant.availability.maxOrderable, inBag)
  const isLength = unit.kind === "length"
  const parsed = parseDisplayQuantity(unit, text)
  const check = parsed.ok ? validateQuantity(unit, parsed.qty, max) : parsed
  const qty = parsed.ok ? parsed.qty : unit.minQty
  const valid = !soldOut && max > 0 && check.ok === true
  const setQty = (n: number) => setText(baseToDisplayString(unit, n))
  const what = isLength ? "Length in metres" : "Quantity"

  // The option picker below is switched off for now; this is what it calls when it is on.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function choose(id: string) {
    const next = variants.find((v) => v.id === id)
    if (!next) return
    setVariantId(id)
    const nextMax = remainingOrderable(next.unit, next.availability.maxOrderable, 0)
    setText(
      baseToDisplayString(
        next.unit,
        Math.min(Math.max(qty, next.unit.minQty), Math.max(nextMax, next.unit.minQty))
      )
    )
  }

  async function onAdd() {
    if (!valid || !parsed.ok || !variant) return
    const result = await add(variant, parsed.qty)
    setAnnouncement(result.message)
  }

  return (
    <div className="flex flex-col gap-2">
      {/* {variants.length > 1 ? (
        <select
          aria-label={`Option for ${name}`}
          value={variant.id}
          onChange={(e) => choose(e.target.value)}
          className="h-9 w-full border border-input bg-background px-2 text-sm"
        >
          {variants.map((v) => (
            <option key={v.id} value={v.id} disabled={v.availability.status === "out_of_stock"}>
              {v.label}
              {v.availability.status === "out_of_stock" ? " (sold out)" : ""}
            </option>
          ))}
        </select>
      ) : null} */}
      <div className="flex flex-col gap-2">
        {/* The border is drawn on top (::after), so a hovered button can never cover it. */}
        <div className="relative flex h-9 w-full items-center rounded-md after:pointer-events-none after:absolute after:inset-0 after:rounded-md after:border after:border-input after:content-['']">
          <button
            type="button"
            aria-label={`${isLength ? "Shorter" : "Fewer"}: ${name}`}
            disabled={soldOut || !parsed.ok || parsed.qty <= unit.minQty}
            onClick={() => setQty(stepQuantity(unit, qty, -1, max))}
            className="flex h-full w-10 shrink-0 items-center justify-center rounded-l-md hover:bg-muted disabled:opacity-35"
          >
            <Minus aria-hidden="true" className="size-3.5" />
          </button>
          <div className="relative h-full flex-1">
            <input
              inputMode="decimal"
              autoComplete="off"
              aria-label={`${what}: ${name}`}
              aria-invalid={!soldOut && !check.ok}
              disabled={soldOut}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="tabular h-full w-full bg-transparent text-center text-sm outline-none"
            />
            {isLength ? (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-muted-foreground"
              >
                m
              </span>
            ) : null}
          </div>
          <button
            type="button"
            aria-label={`${isLength ? "Longer" : "More"}: ${name}`}
            disabled={soldOut || !parsed.ok || max === 0 || qty + unit.stepQty > max}
            onClick={() => setQty(stepQuantity(unit, qty, 1, max))}
            className="flex h-full w-10 shrink-0 items-center justify-center rounded-r-md hover:bg-muted disabled:opacity-35"
          >
            <Plus aria-hidden="true" className="size-3.5" />
          </button>
        </div>
        <Button
          type="button"
          size="sm"
          className="h-9 w-full"
          aria-label={`Add ${name} to bag`}
          disabled={!valid || adding || waiting}
          onClick={() => void onAdd()}
        >
          <ShoppingBag aria-hidden="true" className="size-4" />
          Add to bag
        </Button>
      </div>
      {!soldOut && !check.ok ? (
        <p role="alert" className="text-xs text-destructive">
          {check.message}
        </p>
      ) : null}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  )
}
