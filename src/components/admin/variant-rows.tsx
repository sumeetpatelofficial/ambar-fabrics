"use client"

import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { cn } from "cn"
import { SelectField } from "@/components/admin/fields"
import { TextField } from "@/components/forms/text-field"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { lineSubtotalPaise, parseDisplayQuantity, units } from "@/lib/measure"
import { formatPaise, rupeesToPaise } from "@/lib/money"

/** Colours a fabric shop uses most. Clicking one fills in the name and a matching colour. */
const PRESETS = [
  ["Red", "#c62828"],
  ["Maroon", "#7b1e2e"],
  ["Pink", "#e8789a"],
  ["Peach", "#f4a98c"],
  ["Orange", "#e8741a"],
  ["Mustard", "#d6a219"],
  ["Yellow", "#f2d03b"],
  ["Green", "#2e7d4f"],
  ["Sage", "#9bae8e"],
  ["Teal", "#1f7a7a"],
  ["Sky blue", "#7cb7e6"],
  ["Blue", "#2f5fb3"],
  ["Navy", "#1c2a52"],
  ["Purple", "#6a3d94"],
  ["Brown", "#7a5230"],
  ["Beige", "#d9c7a3"],
  ["Ivory", "#f5efe0"],
  ["White", "#ffffff"],
  ["Grey", "#8a8a8a"],
  ["Black", "#1b1b1b"],
  ["Gold", "#c9a23c"],
] as const

type Kind = "length" | "piece" | "set" | "pair" | "pack"
const KIND_LABEL: Record<Kind, string> = {
  length: "Length (metres)",
  piece: "Piece",
  set: "Set",
  pair: "Pair",
  pack: "Pack",
}

const money = (text: string): number | null => {
  try {
    return rupeesToPaise(text)
  } catch {
    return null
  }
}

/** What selling one unit earns after what it cost, and the same for all the stock entered. Shown as you type. */
export function ProfitPreview({
  price,
  cost,
  stock,
  kind,
}: {
  price: string
  cost: string
  stock: string
  kind: Kind
}) {
  const sell = money(price)
  const paid = money(cost)
  if (sell === null || paid === null || sell <= 0)
    return (
      <p className="min-h-5 text-sm text-muted-foreground">Enter both prices to see your profit.</p>
    )
  const per = sell - paid
  const unitWord = kind === "length" ? "metre" : kind
  const margin = Math.round((per / sell) * 1000) / 10
  const unit = kind === "length" ? units.perMetre() : units.each(kind)
  const qty = stock ? parseDisplayQuantity(unit, stock) : null
  const total = qty?.ok
    ? { cost: lineSubtotalPaise(paid, qty.qty, unit), sell: lineSubtotalPaise(sell, qty.qty, unit) }
    : null
  const loss = per < 0
  return (
    <p role="status" className={cn("text-sm", loss ? "text-[#b3261e]" : "text-[#0e6b46]")}>
      {loss
        ? `You would lose ${formatPaise(-per)} on every ${unitWord}.`
        : `Profit ${formatPaise(per)} per ${unitWord}, a ${margin}% margin.`}
      {total
        ? ` All ${stock} ${kind === "length" ? "m" : ""}: cost ${formatPaise(total.cost)}, sells for ${formatPaise(total.sell)}, ${loss ? "loss" : "profit"} ${formatPaise(Math.abs(total.sell - total.cost))}.`
        : ""}
    </p>
  )
}

function Row({
  index,
  kind,
  showCost,
  values,
  errors,
  onRemove,
  canRemove,
}: {
  index: number
  kind: Kind
  showCost: boolean
  values: Record<string, string>
  errors: Record<string, string>
  onRemove: () => void
  canRemove: boolean
}) {
  const name = (f: string) => `variants.${index}.${f}`
  const v = (f: string, d = "") => values[name(f)] ?? d
  const e = (f: string) => errors[name(f)]
  const [colour, setColour] = useState(v("colorName"))
  const [hex, setHex] = useState(v("colorHex", "#9bae8e"))
  const [price, setPrice] = useState(v("price"))
  const [cost, setCost] = useState(v("purchasePrice"))
  const [stock, setStock] = useState(v("initialStock"))
  const unitWord = kind === "length" ? "metres" : kind === "piece" ? "pieces" : `${kind}s`
  return (
    <fieldset className="flex flex-col gap-4 rounded-xl border p-4">
      <legend className="px-1 text-sm font-medium">
        {colour ? `Colour: ${colour}` : `Variant ${index + 1}`}
      </legend>
      <input type="hidden" name={name("status")} value="active" />
      <input type="hidden" name={name("kind")} value={kind} />
      <input
        type="hidden"
        name={name("minQty")}
        value={v("minQty", kind === "length" ? "0.5" : "1")}
      />
      <input
        type="hidden"
        name={name("stepQty")}
        value={v("stepQty", kind === "length" ? "0.5" : "1")}
      />
      <input
        type="hidden"
        name={name("lowStock")}
        value={v("lowStock", kind === "length" ? "2" : "2")}
      />

      <div className="flex flex-col gap-2">
        <Label className="text-sm">Colour</Label>
        <ul className="flex flex-wrap gap-1.5" aria-label="Common colours">
          {PRESETS.map(([n, h]) => (
            <li key={n}>
              <button
                type="button"
                onClick={() => {
                  setColour(n)
                  setHex(h)
                }}
                aria-label={`Use ${n}`}
                aria-pressed={colour === n}
                title={n}
                className={cn(
                  "size-7 rounded-full border border-foreground/25 focus-visible:outline-2",
                  colour === n && "ring-2 ring-primary ring-offset-2"
                )}
                style={{ backgroundColor: h }}
              />
            </li>
          ))}
        </ul>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_8rem]">
          <TextField
            name={name("colorName")}
            label="Colour name"
            value={colour}
            onChange={(ev) => setColour(ev.target.value)}
            error={e("colorName")}
            placeholder="Wine red"
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${name("colorPicker")}`} className="text-sm">
              Pick any colour
            </Label>
            <input
              id={name("colorPicker")}
              type="color"
              value={/^#[0-9a-f]{6}$/i.test(hex) ? hex : "#9bae8e"}
              onChange={(ev) => setHex(ev.target.value)}
              className="h-11 w-16 cursor-pointer border border-input bg-background p-1"
            />
          </div>
          <TextField
            name={name("colorHex")}
            label="Colour code"
            value={hex}
            onChange={(ev) => setHex(ev.target.value)}
            error={e("colorHex")}
          />
        </div>
      </div>

      <div className={cn("grid gap-4", showCost ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
        <TextField
          name={name("price")}
          label={`Selling price (₹ per ${kind === "length" ? "metre" : kind})`}
          inputMode="decimal"
          required
          value={price}
          onChange={(ev) => setPrice(ev.target.value)}
          error={e("price")}
        />
        {showCost ? (
          <TextField
            name={name("purchasePrice")}
            label={`Purchase price (₹ per ${kind === "length" ? "metre" : kind})`}
            inputMode="decimal"
            value={cost}
            onChange={(ev) => setCost(ev.target.value)}
            error={e("purchasePrice")}
            hint="What you paid. Only you and other admins can see this."
          />
        ) : null}
        <TextField
          name={name("initialStock")}
          label={`Quantity in stock (${unitWord})`}
          inputMode="decimal"
          value={stock}
          onChange={(ev) => setStock(ev.target.value)}
          error={e("initialStock")}
        />
      </div>
      {showCost ? <ProfitPreview price={price} cost={cost} stock={stock} kind={kind} /> : null}

      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground underline-offset-4 hover:underline">
          More options for this colour
        </summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <TextField name={name("size")} label="Size" value={v("size")} error={e("size")} />
          <TextField
            name={name("sku")}
            label="Product code (SKU)"
            defaultValue={v("sku")}
            error={e("sku")}
            hint="Leave blank and we will make one."
          />
          <TextField
            name={name("compareAt")}
            label="Original price (struck through)"
            inputMode="decimal"
            defaultValue={v("compareAt")}
            error={e("compareAt")}
          />
          <TextField
            name={name("salePrice")}
            label="Sale price"
            inputMode="decimal"
            defaultValue={v("salePrice")}
            error={e("salePrice")}
          />
          <TextField
            name={name("weightGrams")}
            label="Weight (g)"
            inputMode="numeric"
            defaultValue={v("weightGrams")}
            error={e("weightGrams")}
          />
        </div>
      </details>
      {canRemove ? (
        <div>
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 aria-hidden="true" className="size-4" /> Remove this colour
          </Button>
        </div>
      ) : null}
    </fieldset>
  )
}

/** Colours, prices, purchase prices and stock for a new product, one block per colour. */
export function VariantRows({
  showCost,
  values,
  errors,
}: {
  showCost: boolean
  values: Record<string, string>
  errors: Record<string, string>
}) {
  const typedRows = new Set(
    Object.keys(values)
      .map((k) => /^variants\.(\d+)\./.exec(k)?.[1])
      .filter(Boolean)
      .map(Number)
  )
  const [rows, setRows] = useState<number[]>(
    typedRows.size ? [...typedRows].sort((a, b) => a - b) : [0]
  )
  const [kind, setKind] = useState<Kind>((values["variants.0.kind"] as Kind) || "length")
  const next = Math.max(-1, ...rows) + 1
  return (
    <section aria-labelledby="variants-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="variants-heading" className="text-2xl">
            Colours, prices and stock
          </h2>
          <p className="text-sm text-muted-foreground">
            Add a block for each colour or size you sell. Customers choose between them on the
            product page.
          </p>
        </div>
        <div className="w-56">
          <SelectField
            name="soldBy"
            label="Sold by"
            value={kind}
            onChange={(v) => setKind(v as Kind)}
          >
            {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </SelectField>
        </div>
      </div>
      {errors["variants"] ? (
        <p role="alert" className="text-sm text-destructive">
          {errors["variants"]}
        </p>
      ) : null}
      {rows.map((i) => (
        <Row
          key={`${i}-${kind}`}
          index={i}
          kind={kind}
          showCost={showCost}
          values={values}
          errors={errors}
          canRemove={rows.length > 1}
          onRemove={() => setRows(rows.filter((r) => r !== i))}
        />
      ))}
      <div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setRows([...rows, next])}
          disabled={rows.length >= 20}
        >
          <Plus aria-hidden="true" className="size-4" /> Add another colour
        </Button>
      </div>
    </section>
  )
}
