import { rupeesInWords } from "@/lib/amount-words"
import { formatPaise } from "@/lib/money"
import type { InvoiceData } from "@/services/invoice-service"
import { PrintButton } from "@/components/invoice/print-button"

const date = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeZone: "Asia/Kolkata" }).format(
    new Date(iso)
  )

/**
 * The invoice as a page that prints cleanly (use "Save as PDF" in the print window to keep a copy).
 * A shop that is not registered for GST issues a "Bill of Supply" with no tax on it; once GST is switched
 * on in Settings and a GSTIN is entered, the same page becomes a "Tax Invoice".
 */
export function InvoiceDocument({ invoice: d }: { invoice: InvoiceData }) {
  const taxed = d.title === "Tax Invoice"
  return (
    <article
      aria-label={`${d.title} ${d.number}`}
      className="mx-auto w-full max-w-3xl bg-white p-6 text-[0.95rem] text-black sm:p-10 print:max-w-none print:p-0"
    >
      <div className="mb-6 flex justify-end print:hidden">
        <PrintButton />
      </div>
      <header className="flex flex-wrap items-start justify-between gap-6 border-b pb-6">
        <div>
          <p className="font-display text-3xl">{d.seller.name}</p>
          {d.seller.addressLines.map((l) => (
            <p key={l} className="text-sm">
              {l}
            </p>
          ))}
          {d.seller.phone ? <p className="text-sm">Phone {d.seller.phone}</p> : null}
          {d.seller.email ? <p className="text-sm">{d.seller.email}</p> : null}
          {d.seller.gstin ? <p className="text-sm">GSTIN {d.seller.gstin}</p> : null}
        </div>
        <div className="text-right">
          <h1 className="text-3xl">{d.title}</h1>
          <p className="tabular mt-2 text-sm">
            Number <strong>{d.number}</strong>
          </p>
          <p className="text-sm">Date {date(d.issuedAt)}</p>
          <p className="text-sm">
            Order {d.orderNumber}, placed {date(d.orderedAt)}
          </p>
        </div>
      </header>

      <section
        aria-label="Billed and delivered to"
        className="grid gap-6 border-b py-6 sm:grid-cols-2"
      >
        <div>
          <h2 className="font-sans text-sm font-semibold">
            {d.inStore ? "Billed to" : "Billed and delivered to"}
          </h2>
          <p className="mt-1">{d.buyer.name}</p>
          {d.buyer.lines.map((l) => (
            <p key={l} className="text-sm">
              {l}
            </p>
          ))}
          {d.buyer.phone ? <p className="text-sm">Phone {d.buyer.phone}</p> : null}
          {d.buyer.email ? <p className="text-sm">{d.buyer.email}</p> : null}
        </div>
        <div>
          <h2 className="font-sans text-sm font-semibold">Payment</h2>
          <p className="mt-1 text-sm">{d.payment}</p>
        </div>
      </section>

      <table className="mt-6 w-full text-left text-sm">
        <thead className="border-b text-xs">
          <tr>
            <th scope="col" className="py-2 font-semibold">
              Item
            </th>
            <th scope="col" className="py-2 font-semibold">
              Quantity
            </th>
            <th scope="col" className="py-2 text-right font-semibold">
              Rate
            </th>
            {taxed ? (
              <th scope="col" className="py-2 text-right font-semibold">
                GST
              </th>
            ) : null}
            <th scope="col" className="py-2 text-right font-semibold">
              Amount
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {d.lines.map((l, i) => (
            <tr key={`${l.description}-${i}`}>
              <td className="py-3 pr-3">
                {l.description}
                {l.detail ? (
                  <span className="block text-xs text-neutral-600">{l.detail}</span>
                ) : null}
              </td>
              <td className="tabular py-3">{l.quantity}</td>
              <td className="tabular py-3 text-right">
                {formatPaise(l.ratePaise)}
                <span className="block text-xs text-neutral-600">{l.unitLabel}</span>
              </td>
              {taxed ? <td className="tabular py-3 text-right">{l.taxRatePercent}%</td> : null}
              <td className="tabular py-3 text-right">{formatPaise(l.amountPaise)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="tabular mt-4 ml-auto flex max-w-xs flex-col gap-1.5 text-sm">
        <div className="flex justify-between gap-4">
          <dt>Items</dt>
          <dd>{formatPaise(d.subtotalPaise)}</dd>
        </div>
        {d.discountPaise > 0 ? (
          <div className="flex justify-between gap-4">
            <dt>Discount{d.couponCode ? ` (${d.couponCode})` : ""}</dt>
            <dd>-{formatPaise(d.discountPaise)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-4">
          <dt>Shipping</dt>
          <dd>{d.shippingPaise === 0 ? "Free" : formatPaise(d.shippingPaise)}</dd>
        </div>
        {taxed ? (
          <div className="flex justify-between gap-4">
            <dt>GST {d.taxExclusive ? "added" : "included"}</dt>
            <dd>{formatPaise(d.taxPaise)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-4 border-t pt-2 text-base font-semibold">
          <dt>Total</dt>
          <dd>{formatPaise(d.totalPaise)}</dd>
        </div>
        {d.refundedPaise > 0 ? (
          <div className="flex justify-between gap-4">
            <dt>Refunded</dt>
            <dd>{formatPaise(d.refundedPaise)}</dd>
          </div>
        ) : null}
      </dl>

      <p className="mt-6 text-sm">
        <strong>Amount in words:</strong> {rupeesInWords(d.totalPaise)}
      </p>
      <p className="mt-6 border-t pt-4 text-xs text-neutral-600">{d.note}</p>
    </article>
  )
}
