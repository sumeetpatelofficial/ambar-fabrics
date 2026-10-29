"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useId, useRef, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RangeSlider } from "@/components/ui/range-slider"
import { formatPaise } from "@/lib/money"
import { listingHref, type ListingState } from "@/features/catalog/listing"
import type { Facets, FacetValue } from "@/features/catalog/types"
import type { Sort } from "@/features/catalog/schemas"

const FAMILY_HEX: Record<string, string> = {
  green: "#8a9a7b",
  blue: "#3d4a6b",
  red: "#9a4431",
  yellow: "#c79a2d",
  pink: "#c98a86",
  purple: "#5b3a52",
  neutral: "#d9cdb4",
  grey: "#6b6a66",
  black: "#23211d",
  white: "#f4f1ea",
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function Group({
  uid,
  name,
  legend,
  values,
  selected,
  dots,
  onChange,
}: {
  uid: string
  name: "fabric" | "color" | "pattern"
  legend: string
  values: FacetValue[]
  selected: string[]
  dots?: boolean
  onChange: () => void
}) {
  // Closed to keep the panel short; open from the start when something in it is chosen.
  const [open, setOpen] = useState(selected.length > 0)
  // A selected value must stay visible even if the other filters now give it a count of zero.
  const shown = [...values]
  for (const s of selected)
    if (!shown.some((v) => v.value === s)) shown.push({ value: s, count: 0 })
  if (shown.length === 0) return null
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="group border-b py-4 [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="flex min-h-10 cursor-pointer items-center justify-between text-base font-medium">
        {legend}
        <span aria-hidden="true" className="text-lg leading-none text-muted-foreground">
          <span className="group-open:hidden">+</span>
          <span className="hidden group-open:inline">−</span>
        </span>
      </summary>
      <fieldset className="mt-2 flex flex-col">
        <legend className="sr-only">{legend}</legend>
        {shown.map((v) => {
          // Unique per form instance: the sidebar and the mobile drawer both render this form.
          const id = `${uid}-${name}-${v.value.replace(/\W+/g, "-")}`
          return (
            <label
              key={v.value}
              htmlFor={id}
              className="flex min-h-10 cursor-pointer items-center gap-3 text-[0.95rem]"
            >
              <input
                id={id}
                type="checkbox"
                name={name}
                value={v.value}
                defaultChecked={selected.includes(v.value)}
                onChange={onChange}
                className="size-5 accent-[var(--primary)]"
              />
              {dots ? (
                <span
                  aria-hidden="true"
                  className="size-3.5 rounded-full border border-foreground/20"
                  style={{ backgroundColor: FAMILY_HEX[v.value] ?? "transparent" }}
                />
              ) : null}
              <span>{titleCase(v.value)}</span>
              <span className="tabular ml-auto text-sm text-muted-foreground">{v.count}</span>
            </label>
          )
        })}
      </fieldset>
    </details>
  )
}

/**
 * Price: a slider with two handles over the prices in this list, with the two numbers beside it for typing
 * exact amounts. The numbers are the form fields (`minPrice`, `maxPrice`), so it still works without
 * JavaScript; a value at the very end of the slider means "no limit" and is left out of the address.
 */
function PriceRange({
  uid,
  bounds,
  min: chosenMin,
  max: chosenMax,
  onCommit,
}: {
  uid: string
  bounds: Facets["price"]
  min?: number
  max?: number
  onCommit: () => void
}) {
  const low = bounds ? Math.floor(bounds.minPaise / 100) : 0
  const high = bounds ? Math.ceil(bounds.maxPaise / 100) : 0
  const clamp = (n: number) => Math.min(high, Math.max(low, n))
  const [from, setFrom] = useState(chosenMin !== undefined ? String(chosenMin) : "")
  const [to, setTo] = useState(chosenMax !== undefined ? String(chosenMax) : "")
  // The slider shows the numbers, or the ends of the range where one is empty.
  const num = (text: string, fallback: number) =>
    /^\d{1,8}$/.test(text.trim()) ? clamp(Number(text)) : fallback
  const pair: [number, number] = [num(from, low), num(to, high)]
  const usable = bounds !== null && high > low

  function fromSlider([a, b]: [number, number]) {
    setFrom(a <= low ? "" : String(a))
    setTo(b >= high ? "" : String(b))
  }
  const rupees = (n: number) => formatPaise(n * 100)

  return (
    <fieldset className="border-b py-4">
      <legend className="min-h-6 text-base font-medium">Price</legend>
      {usable ? (
        <div className="px-1">
          <RangeSlider
            min={low}
            max={high}
            value={pair}
            labels={["Lowest price", "Highest price"]}
            formatValue={rupees}
            onValueChange={fromSlider}
            onValueCommitted={(v) => {
              fromSlider(v)
              // The fields update on the next render; apply after it so the new values are in the form.
              setTimeout(onCommit, 0)
            }}
          />
          <p
            aria-hidden="true"
            className="tabular -mt-1 flex justify-between text-sm text-muted-foreground"
          >
            <span>{rupees(low)}</span>
            <span>{rupees(high)}</span>
          </p>
        </div>
      ) : null}
      <div className="mt-3 flex items-end gap-3">
        <div className="flex-1">
          <Label htmlFor={`${uid}-min`} className="mb-1 text-sm text-muted-foreground">
            From (₹)
          </Label>
          <Input
            id={`${uid}-min`}
            name="minPrice"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            onBlur={() => from !== (chosenMin ?? "").toString() && onCommit()}
            placeholder={bounds ? String(low) : "0"}
          />
        </div>
        <div className="flex-1">
          <Label htmlFor={`${uid}-max`} className="mb-1 text-sm text-muted-foreground">
            To (₹)
          </Label>
          <Input
            id={`${uid}-max`}
            name="maxPrice"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            onBlur={() => to !== (chosenMax ?? "").toString() && onCommit()}
            placeholder={bounds ? String(high) : ""}
          />
        </div>
      </div>
    </fieldset>
  )
}

/**
 * Filter form. It is a real GET form, so it works without JavaScript; with JavaScript it navigates
 * without a full reload, and (when `autoApply`) applies checkbox changes immediately.
 */
export function FilterForm({
  basePath,
  state,
  facets,
  defaultSort,
  autoApply = false,
  onApplied,
}: {
  basePath: string
  state: ListingState
  facets: Facets
  defaultSort: Sort
  autoApply?: boolean
  onApplied?: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)
  const uid = useId()

  function apply() {
    const form = formRef.current
    if (!form) return
    const data = new FormData(form)
    const read = (k: string) => data.getAll(k).map(String)
    const num = (k: string) => {
      const v = String(data.get(k) ?? "").trim()
      return /^\d{1,8}$/.test(v) ? Number(v) : undefined
    }
    const min = num("minPrice")
    const max = num("maxPrice")
    const next: Partial<ListingState> = {
      q: state.q,
      sort: state.sort,
      fabric: read("fabric"),
      color: read("color"),
      pattern: read("pattern"),
      minPrice: min !== undefined && max !== undefined && min > max ? max : min,
      maxPrice: min !== undefined && max !== undefined && min > max ? min : max,
      ...(data.get("availability") ? { availability: "in_stock" as const } : {}),
      page: 1,
    }
    startTransition(() => {
      router.push(listingHref(basePath, next, defaultSort))
      onApplied?.()
    })
  }

  return (
    <form
      ref={formRef}
      method="get"
      action={basePath}
      aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault()
        apply()
      }}
      className="flex flex-col"
    >
      {state.q ? <input type="hidden" name="q" value={state.q} /> : null}
      {state.sort !== defaultSort ? <input type="hidden" name="sort" value={state.sort} /> : null}

      <PriceRange
        // Start over when the address changes (a cleared filter, a different list).
        key={`${state.minPrice ?? ""}-${state.maxPrice ?? ""}`}
        uid={uid}
        bounds={facets.price}
        min={state.minPrice}
        max={state.maxPrice}
        onCommit={() => autoApply && apply()}
      />

      <Group
        uid={uid}
        name="fabric"
        legend="Fabric"
        values={facets.fabric}
        selected={state.fabric}
        onChange={() => autoApply && apply()}
      />
      <Group
        uid={uid}
        name="color"
        legend="Colour"
        values={facets.color}
        selected={state.color}
        dots
        onChange={() => autoApply && apply()}
      />
      <Group
        uid={uid}
        name="pattern"
        legend="Pattern"
        values={facets.pattern}
        selected={state.pattern}
        onChange={() => autoApply && apply()}
      />

      <label
        htmlFor={`${uid}-stock`}
        className="flex min-h-12 cursor-pointer items-center gap-3 border-b py-2 text-[0.95rem]"
      >
        <input
          id={`${uid}-stock`}
          type="checkbox"
          name="availability"
          value="in_stock"
          defaultChecked={state.availability === "in_stock"}
          onChange={() => autoApply && apply()}
          className="size-5 accent-[var(--primary)]"
        />
        In stock only
      </label>

      <div className="flex flex-col gap-2 pt-4">
        <Button type="submit" disabled={pending}>
          Apply filters
        </Button>
        <Link
          href={listingHref(basePath, { q: state.q, sort: state.sort }, defaultSort)}
          className="inline-flex min-h-10 items-center justify-center text-sm underline underline-offset-4"
        >
          Clear all filters
        </Link>
      </div>
    </form>
  )
}
