"use client"

import { useState } from "react"
import { Minus, Plus } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DeliveryCheck } from "@/components/storefront/product/delivery-check"
import { PriceTag } from "@/components/storefront/price-tag"
import { LengthScale } from "@/components/storefront/product/length-scale"
import { useAddToBag } from "@/components/storefront/use-add-to-bag"
import { WishlistToggle } from "@/components/storefront/wishlist-toggle"
import {
  initialSelection,
  quickPicks,
  remainingOrderable,
  resolveVariant,
  stepQuantity,
  variantOptions,
  type Selection,
} from "@/features/catalog/purchase"
import type { ProductDetailDTO } from "@/features/catalog/types"
import {
  baseToDisplayString,
  formatQuantity,
  lineSubtotalPaise,
  parseDisplayQuantity,
  validateQuantity,
} from "@/lib/measure"
import { formatPaise } from "@/lib/money"
import { useBag } from "@/stores/bag-store"

type Props = { product: Pick<ProductDetailDTO, "slug" | "name" | "variants"> }

const unitWord = { m: "m", cm: "cm" } as const

/**
 * Choose a colour or size, choose how much, see the exact price, add to the bag. Every number comes from
 * the shared measurement and pricing functions; the server re-checks all of it when it is saved (signed in) and again at checkout.
 */
export function PurchasePanel({ product }: Props) {
  const { variants } = product
  const options = variantOptions(variants)
  const [selection, setSelection] = useState<Selection>(() => initialSelection(variants))
  const variant = resolveVariant(variants, selection) ?? variants[0]
  const [text, setText] = useState(() =>
    variant ? baseToDisplayString(variant.unit, variant.unit.minQty) : ""
  )
  const inBag = useBag((s) => (s.hydrated && variant ? s.qtyOf(variant.id) : 0))
  const { add: addToBag, adding, waiting } = useAddToBag(product)
  const [announcement, setAnnouncement] = useState("")

  if (!variant) return null
  const { unit, availability } = variant
  const soldOut = availability.status === "out_of_stock"
  const max = remainingOrderable(unit, availability.maxOrderable, inBag)
  const isLength = unit.kind === "length"

  const parsed = parseDisplayQuantity(unit, text)
  const check = parsed.ok ? validateQuantity(unit, parsed.qty, max) : parsed
  const qty = parsed.ok ? parsed.qty : unit.minQty
  const valid = !soldOut && max > 0 && check.ok === true
  const errorId = "qty-error"

  function choose(partial: Selection) {
    const next = { ...selection, ...partial }
    // If that exact combination does not exist, follow the option just chosen and let the other adapt.
    const target = resolveVariant(variants, next) ?? resolveVariant(variants, partial)
    if (!target) return
    setSelection({ color: target.colorName, size: target.size })
    const targetMax = remainingOrderable(target.unit, target.availability.maxOrderable, 0)
    const clamped = Math.min(
      Math.max(qty, target.unit.minQty),
      Math.max(targetMax, target.unit.minQty)
    )
    setText(baseToDisplayString(target.unit, clamped))
  }

  const setQty = (value: number) => setText(baseToDisplayString(unit, value))

  async function add() {
    if (!valid || !parsed.ok) return
    const result = await addToBag(variant!, parsed.qty)
    setAnnouncement(result.message)
  }

  const subtotal =
    valid && parsed.ok ? lineSubtotalPaise(variant.pricePaise, parsed.qty, unit) : null
  const picks = quickPicks(unit, max)

  return (
    <div className="flex flex-col gap-6">
      <PriceTag
        pricePaise={variant.pricePaise}
        comparePaise={variant.comparePaise}
        unitLabel={variant.unitLabel}
        className="text-2xl"
      />

      {options.colors.length > 1 ? (
        <fieldset>
          <legend className="mb-2 text-sm">
            Colour: <span className="font-medium">{variant.colorName}</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {options.colors.map((c) => {
              const target =
                resolveVariant(variants, { ...selection, color: c.name }) ??
                resolveVariant(variants, { color: c.name })
              const gone = target?.availability.status === "out_of_stock"
              return (
                <label key={c.name} className="relative cursor-pointer">
                  <input
                    type="radio"
                    name="colour"
                    value={c.name}
                    checked={selection.color === c.name}
                    onChange={() => choose({ color: c.name })}
                    className="peer sr-only"
                  />
                  <span
                    className={cn(
                      "block size-10 rounded-full border border-foreground/25 p-0.5 transition-shadow",
                      "peer-checked:ring-2 peer-checked:ring-primary peer-checked:ring-offset-2 peer-checked:ring-offset-background",
                      "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2",
                      gone && "opacity-45"
                    )}
                  >
                    <span
                      className="block size-full rounded-full"
                      style={{ backgroundColor: c.hex }}
                    />
                  </span>
                  <span className="sr-only">
                    {c.name}
                    {gone ? ", out of stock" : ""}
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>
      ) : null}

      {options.sizes.length > 0 ? (
        <fieldset>
          <legend className="mb-2 text-sm">
            Size: <span className="font-medium">{variant.size}</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {options.sizes.map((s) => {
              const target =
                resolveVariant(variants, { ...selection, size: s }) ??
                resolveVariant(variants, { size: s })
              const gone = target?.availability.status === "out_of_stock"
              return (
                <label key={s} className="relative cursor-pointer">
                  <input
                    type="radio"
                    name="size"
                    value={s}
                    checked={selection.size === s}
                    onChange={() => choose({ size: s })}
                    className="peer sr-only"
                  />
                  <span
                    className={cn(
                      "flex h-10 min-w-12 items-center justify-center border border-input px-3 text-sm transition-colors",
                      "peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground",
                      "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2",
                      gone && "text-muted-foreground line-through"
                    )}
                  >
                    {s}
                    {gone ? <span className="sr-only">, out of stock</span> : null}
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>
      ) : null}

      <p
        className={cn(
          "text-sm font-medium",
          availability.status === "in_stock" && "text-primary",
          availability.status === "low_stock" && "text-madder",
          soldOut && "text-muted-foreground"
        )}
      >
        {availability.label}
      </p>

      {soldOut ? null : (
        <div className="flex flex-col gap-3">
          <Label htmlFor="qty" className="text-sm">
            {isLength ? "Length" : "Quantity"}
            {isLength ? (
              <span className="font-normal text-muted-foreground">
                {" "}
                (in steps of {baseToDisplayString(unit, unit.stepQty)}{" "}
                {unitWord[unit.displayUnit as "m"] ?? ""}, from{" "}
                {baseToDisplayString(unit, unit.minQty)} {unitWord[unit.displayUnit as "m"] ?? ""})
              </span>
            ) : null}
          </Label>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={isLength ? "Shorter" : "Decrease quantity"}
              disabled={!parsed.ok || parsed.qty <= unit.minQty}
              onClick={() => setQty(stepQuantity(unit, qty, -1, max))}
            >
              <Minus aria-hidden="true" className="size-4" />
            </Button>
            <div className="relative w-28">
              <Input
                id="qty"
                inputMode="decimal"
                autoComplete="off"
                value={text}
                onChange={(e) => setText(e.target.value)}
                aria-invalid={!check.ok}
                aria-describedby={!check.ok ? errorId : undefined}
                className={cn("tabular h-10 text-center text-base", isLength && "pr-8")}
              />
              {isLength ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground"
                >
                  m
                </span>
              ) : null}
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={isLength ? "Longer" : "Increase quantity"}
              disabled={!parsed.ok || max === 0 || qty + unit.stepQty > max}
              onClick={() => setQty(stepQuantity(unit, qty, 1, max))}
            >
              <Plus aria-hidden="true" className="size-4" />
            </Button>
          </div>

          {picks.length > 0 ? (
            <ul className="flex flex-wrap gap-2" aria-label="Common lengths">
              {picks.map((p) => (
                <li key={p}>
                  <button
                    type="button"
                    onClick={() => setQty(p)}
                    aria-pressed={parsed.ok && parsed.qty === p}
                    className={cn(
                      "tabular inline-flex min-h-9 items-center border px-3 text-sm transition-colors hover:bg-muted",
                      parsed.ok && parsed.qty === p && "border-primary bg-primary/10"
                    )}
                  >
                    {formatQuantity(unit, p)}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {isLength ? <LengthScale qtyMm={qty} /> : null}

          <p
            id={errorId}
            role="alert"
            className={cn("min-h-5 text-sm text-destructive", check.ok && "sr-only")}
          >
            {check.ok ? "" : check.message}
          </p>
          {max === 0 && inBag > 0 ? (
            <p className="text-sm text-muted-foreground">
              You already have all that is available in your bag.
            </p>
          ) : null}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button size="lg" className="flex-1" disabled={!valid || adding || waiting} onClick={add}>
          {soldOut
            ? "Out of stock"
            : subtotal !== null
              ? `Add to bag, ${formatPaise(subtotal)}`
              : "Add to bag"}
        </Button>
        <WishlistToggle
          slug={product.slug}
          productName={product.name}
          pricePaise={variant?.pricePaise}
          className="size-12 border [&>svg]:size-5"
        />
      </div>
      {subtotal !== null && parsed.ok ? (
        <p className="tabular text-sm text-muted-foreground">
          {formatQuantity(unit, parsed.qty)} at {formatPaise(variant.pricePaise)}{" "}
          {variant.unitLabel}. Taxes and shipping are added at checkout.
        </p>
      ) : null}
      <DeliveryCheck />
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  )
}
