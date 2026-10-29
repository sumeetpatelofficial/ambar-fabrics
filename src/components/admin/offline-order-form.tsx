"use client"

import { Minus, Plus, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { ChoiceSelect } from "@/components/ui/choice-select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { previewSaleAction, recordSaleAction, searchSellableAction } from "@/features/admin/actions"
import { stepQuantity } from "@/features/catalog/purchase"
import { baseToDisplayString, parseDisplayQuantity, validateQuantity } from "@/lib/measure"
import { formatPaise } from "@/lib/money"
import type { OfflinePreview, SellableRow } from "@/services/offline-order-service"

type Line = { row: SellableRow; text: string }

const lineQty = (l: Line) => {
  const parsed = parseDisplayQuantity(l.row.unit, l.text)
  if (!parsed.ok) return { ok: false as const, message: parsed.message }
  const check = validateQuantity(l.row.unit, parsed.qty, l.row.maxOrderable)
  return check.ok
    ? { ok: true as const, qty: parsed.qty }
    : { ok: false as const, message: check.message }
}

/** Records a sale made over the counter: pick what was sold, say how it was paid, and the stock comes off. */
export function OfflineOrderForm() {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [found, setFound] = useState<{ query: string; rows: SellableRow[]; error?: string } | null>(
    null
  )
  const [lines, setLines] = useState<Line[]>([])
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [discountOn, setDiscountOn] = useState(false)
  const [kind, setKind] = useState<"amount" | "percent">("amount")
  const [discountText, setDiscountText] = useState("")
  const [reason, setReason] = useState("")
  const [method, setMethod] = useState<"cash" | "upi" | "card">("cash")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  // One sale, one key: pressing Record twice cannot make two sales.
  const [key] = useState(() => crypto.randomUUID())
  const [previewed, setPreviewed] = useState<{
    id: string
    result: { ok: true; preview: OfflinePreview } | { ok: false; message: string }
  } | null>(null)

  const parsed = lines.map(lineQty)
  const allValid = lines.length > 0 && parsed.every((p) => p.ok)
  const discount =
    discountOn && discountText.trim() ? { kind, text: discountText.trim(), reason } : null
  const payload = allValid
    ? {
        lines: lines.map((l, i) => ({
          variantId: l.row.variantId,
          qty: (parsed[i] as { qty: number }).qty,
        })),
        discount,
      }
    : null
  const payloadId = payload ? JSON.stringify(payload) : ""

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) return
    const timer = setTimeout(async () => {
      const result = await searchSellableAction(q)
      setFound(
        result.ok ? { query: q, rows: result.rows } : { query: q, rows: [], error: result.message }
      )
    }, 250)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    if (!payload) return
    const timer = setTimeout(async () => {
      setPreviewed({ id: payloadId, result: await previewSaleAction(payload) })
    }, 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payloadId])

  const results = found && found.query === query.trim() ? found : null
  const preview = previewed && previewed.id === payloadId ? previewed.result : null

  function add(row: SellableRow) {
    setLines((current) =>
      current.some((l) => l.row.variantId === row.variantId)
        ? current
        : [...current, { row, text: baseToDisplayString(row.unit, row.unit.minQty) }]
    )
  }

  function step(index: number, direction: 1 | -1) {
    setLines((current) =>
      current.map((l, i) => {
        if (i !== index) return l
        const now = parseDisplayQuantity(l.row.unit, l.text)
        const qty = stepQuantity(
          l.row.unit,
          now.ok ? now.qty : l.row.unit.minQty,
          direction,
          l.row.maxOrderable
        )
        return { ...l, text: baseToDisplayString(l.row.unit, qty) }
      })
    )
  }

  async function record() {
    if (!payload || busy) return
    setBusy(true)
    setMessage("")
    const result = await recordSaleAction({
      ...payload,
      customer: { name, phone },
      method,
      note,
      key,
    })
    if (result.ok) {
      router.push(`/admin/orders/${result.orderNumber}?recorded=1`)
      return
    }
    setBusy(false)
    setMessage(result.message)
  }

  const canRecord =
    allValid &&
    preview?.ok === true &&
    !busy &&
    (!discountOn || !discountText.trim() || reason.trim().length >= 3)

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[1fr_22rem]">
      <div className="flex flex-col gap-6">
        <section aria-label="Search the catalogue" className="flex flex-col gap-2">
          <Label htmlFor="sale-search" className="text-base">
            Find an item
          </Label>
          <Input
            id="sale-search"
            type="search"
            autoComplete="off"
            placeholder="Product name or SKU"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div aria-live="polite" className="text-sm text-muted-foreground">
            {results?.error ? <p className="text-destructive">{results.error}</p> : null}
            {results && !results.error && results.rows.length === 0 ? (
              <p>Nothing found for “{results.query}”.</p>
            ) : null}
          </div>
          {results && results.rows.length > 0 ? (
            <ul className="divide-y rounded-lg border" aria-label="Search results">
              {results.rows.map((r) => {
                const added = lines.some((l) => l.row.variantId === r.variantId)
                return (
                  <li key={r.variantId} className="flex items-center justify-between gap-3 p-3">
                    <span className="text-sm">
                      {r.productName}
                      {r.option ? `, ${r.option}` : ""}
                      <span className="block text-muted-foreground">
                        {r.sku}, {formatPaise(r.pricePaise)} {r.unitLabel}, {r.stockText}
                      </span>
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={r.maxOrderable === 0 || added}
                      aria-label={`Add ${r.productName}${r.option ? `, ${r.option}` : ""}`}
                      onClick={() => add(r)}
                    >
                      {added ? "Added" : "Add"}
                    </Button>
                  </li>
                )
              })}
            </ul>
          ) : null}
        </section>

        <section aria-labelledby="sale-items" className="flex flex-col gap-2">
          <h2 id="sale-items" className="text-xl">
            Items sold
          </h2>
          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">Search above and add what was sold.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {lines.map((l, i) => {
                const q = parsed[i]!
                const label = `${l.row.productName}${l.row.option ? `, ${l.row.option}` : ""}`
                const isLength = l.row.unit.kind === "length"
                const lineTotal = preview?.ok
                  ? preview.preview.lines.find((x) => x.variantId === l.row.variantId)?.linePaise
                  : undefined
                return (
                  <li key={l.row.variantId} className="flex flex-col gap-2 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-sm">
                        {label}
                        <span className="block text-muted-foreground">
                          {l.row.sku}, {formatPaise(l.row.pricePaise)} {l.row.unitLabel}
                        </span>
                      </span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={`Remove ${label}`}
                        onClick={() => setLines((c) => c.filter((_, j) => j !== i))}
                      >
                        <X aria-hidden="true" className="size-4" />
                      </Button>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="relative flex h-9 w-44 items-center rounded-md after:pointer-events-none after:absolute after:inset-0 after:rounded-md after:border after:border-input after:content-['']">
                        <button
                          type="button"
                          aria-label={`${isLength ? "Shorter" : "Fewer"}: ${label}`}
                          className="flex h-full w-10 items-center justify-center rounded-l-md hover:bg-muted"
                          onClick={() => step(i, -1)}
                        >
                          <Minus aria-hidden="true" className="size-3.5" />
                        </button>
                        <input
                          inputMode="decimal"
                          autoComplete="off"
                          aria-label={`${isLength ? "Length in metres" : "Quantity"}: ${label}`}
                          aria-invalid={!q.ok}
                          value={l.text}
                          onChange={(e) =>
                            setLines((c) =>
                              c.map((x, j) => (j === i ? { ...x, text: e.target.value } : x))
                            )
                          }
                          className="tabular h-full min-w-0 flex-1 bg-transparent text-center text-sm outline-none"
                        />
                        <button
                          type="button"
                          aria-label={`${isLength ? "Longer" : "More"}: ${label}`}
                          className="flex h-full w-10 items-center justify-center rounded-r-md hover:bg-muted"
                          onClick={() => step(i, 1)}
                        >
                          <Plus aria-hidden="true" className="size-3.5" />
                        </button>
                      </div>
                      <span className="tabular text-sm">
                        {lineTotal !== undefined ? formatPaise(lineTotal) : ""}
                      </span>
                    </div>
                    {!q.ok ? (
                      <p role="alert" className="text-sm text-destructive">
                        {q.message}
                      </p>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      <form
        aria-label="Record sale"
        className="flex flex-col gap-4 rounded-lg border p-4"
        onSubmit={(e) => {
          e.preventDefault()
          void record()
        }}
      >
        <div className="grid gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="sale-name" className="text-sm">
              Customer name (optional)
            </Label>
            <Input
              id="sale-name"
              autoComplete="off"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="sale-phone" className="text-sm">
              Phone (optional)
            </Label>
            <Input
              id="sale-phone"
              type="tel"
              autoComplete="off"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={discountOn}
              onChange={(e) => setDiscountOn(e.target.checked)}
            />
            Give a discount on the whole bill
          </label>
          {discountOn ? (
            <div className="grid gap-3">
              <div className="grid grid-cols-[1fr_7rem] gap-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="sale-discount" className="text-sm">
                    {kind === "percent" ? "Discount (%)" : "Discount (₹)"}
                  </Label>
                  <Input
                    id="sale-discount"
                    inputMode="decimal"
                    autoComplete="off"
                    value={discountText}
                    onChange={(e) => setDiscountText(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="sale-discount-kind" className="text-sm">
                    In
                  </Label>
                  <ChoiceSelect
                    id="sale-discount-kind"
                    value={kind}
                    onChange={(v) => setKind(v === "percent" ? "percent" : "amount")}
                  >
                    <option value="amount">Rupees</option>
                    <option value="percent">Percent</option>
                  </ChoiceSelect>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="sale-reason" className="text-sm">
                  Why is it given?
                </Label>
                <Input
                  id="sale-reason"
                  maxLength={200}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="sale-method" className="text-sm">
            Paid by
          </Label>
          <ChoiceSelect
            id="sale-method"
            value={method}
            onChange={(v) => setMethod(v === "upi" ? "upi" : v === "card" ? "card" : "cash")}
          >
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="card">Card</option>
          </ChoiceSelect>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="sale-note" className="text-sm">
            Note (optional)
          </Label>
          <Input
            id="sale-note"
            maxLength={200}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <dl className="tabular flex flex-col gap-1 border-t pt-3 text-sm" aria-live="polite">
          {preview?.ok ? (
            <>
              <div className="flex justify-between">
                <dt>Items</dt>
                <dd>{formatPaise(preview.preview.subtotalPaise)}</dd>
              </div>
              {preview.preview.discountPaise > 0 ? (
                <div className="flex justify-between">
                  <dt>Discount</dt>
                  <dd>−{formatPaise(preview.preview.discountPaise)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between text-base font-semibold">
                <dt>Total</dt>
                <dd>{formatPaise(preview.preview.totalPaise)}</dd>
              </div>
            </>
          ) : (
            <div className="flex justify-between text-base font-semibold">
              <dt>Total</dt>
              <dd>{allValid && !preview ? "…" : "—"}</dd>
            </div>
          )}
        </dl>
        {preview && !preview.ok ? (
          <p role="alert" className="text-sm text-destructive">
            {preview.message}
          </p>
        ) : null}
        <p role="alert" className="text-sm text-destructive empty:hidden">
          {message}
        </p>
        <Button type="submit" disabled={!canRecord}>
          {busy ? "Recording…" : "Record sale"}
        </Button>
      </form>
    </div>
  )
}
