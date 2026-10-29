import Link from "next/link"
import { Download } from "lucide-react"
import { SalesAreaChart } from "@/components/admin/charts/sales-area-chart"
import { PageTitle, staffPage } from "@/components/admin/staff-page"
import { buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatPaise } from "@/lib/money"
import {
  getReports,
  parseReportRange,
  reportPresets,
  type Bucket,
  type Compared,
  type ReportKind,
  type Reports,
} from "@/services/report-service"

const day = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`)
  )

/** How a figure moved against the period just before, in words as well as colour. */
function Change({ c, money }: { c: Compared; money?: boolean }) {
  const was = money ? formatPaise(c.previous) : String(c.previous)
  if (c.previous === 0 && c.value === 0) return <span className="text-xs">No change</span>
  if (c.previous === 0) return <span className="text-xs">New (was {was})</span>
  const pct = ((c.value - c.previous) / c.previous) * 100
  return (
    <span className="text-xs">
      {pct >= 0 ? "Up" : "Down"} {Math.abs(pct).toFixed(1)}% (was {was})
    </span>
  )
}

function Stat({
  label,
  value,
  c,
  money = true,
  note,
}: {
  label: string
  value: string
  c: Compared
  money?: boolean
  note?: string
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="tabular text-xl font-medium">{value}</dd>
      <dd className="text-muted-foreground">
        <Change c={c} money={money} />
      </dd>
      {note ? <dd className="text-xs text-muted-foreground">{note}</dd> : null}
    </div>
  )
}

function Section({
  id,
  title,
  help,
  csv,
  children,
}: {
  id: string
  title: string
  help?: string
  csv?: string
  children: React.ReactNode
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id={id} className="font-sans text-lg font-semibold">
            {title}
          </h2>
          {help ? <p className="max-w-2xl text-sm text-muted-foreground">{help}</p> : null}
        </div>
        {csv ? (
          <Link
            href={csv}
            prefetch={false}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Download aria-hidden="true" className="size-4" /> Download spreadsheet
            <span className="sr-only"> of {title.toLowerCase()}</span>
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  )
}

function Table({
  caption,
  head,
  rows,
  empty = "Nothing in this period.",
}: {
  caption: string
  head: { label: string; right?: boolean }[]
  rows: (string | number)[][]
  empty?: string
}) {
  if (rows.length === 0) return <p className="rounded-xl border p-4 text-sm">{empty}</p>
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-muted/50">
          <tr>
            {head.map((h) => (
              <th
                key={h.label}
                scope="col"
                className={`px-4 py-2.5 font-medium ${h.right ? "text-right" : ""}`}
              >
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular divide-y">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j} className={`px-4 py-2.5 ${head[j]?.right ? "text-right" : ""}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "0%")

function bucketTable(label: string, rows: Bucket[], profit: boolean) {
  const total = rows.reduce((n, b) => n + b.salesPaise, 0)
  return (
    <Table
      caption={`Sales by ${label.toLowerCase()}`}
      head={[
        { label },
        { label: "Order lines", right: true },
        { label: "Item sales", right: true },
        { label: "Share", right: true },
        ...(profit ? [{ label: "Profit", right: true }] : []),
      ]}
      rows={rows.map((b) => [
        b.name,
        b.lines,
        formatPaise(b.salesPaise),
        pct(b.salesPaise, total),
        ...(profit ? [formatPaise(b.profitPaise ?? 0)] : []),
      ])}
    />
  )
}

export default staffPage<{ searchParams: Promise<{ from?: string; to?: string }> }>(
  "analytics:read",
  async ({ actor, props }) => {
    const params = await props.searchParams
    const range = parseReportRange(params)
    const r: Reports = await getReports(actor, range)
    const q = `from=${range.from}&to=${range.to}`
    const csv = (kind: ReportKind) => `/admin/reports/export?report=${kind}&${q}`
    const s = r.summary
    const presets = reportPresets()
    const products = r.products.slice(0, 15)

    return (
      <div className="flex flex-col gap-10">
        <PageTitle title="Reports" crumbs={[{ label: "Reports" }]} />

        <form
          method="get"
          className="flex flex-wrap items-end gap-4"
          aria-label="Choose the period"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="from">From</Label>
            <Input id="from" name="from" type="date" defaultValue={range.from} max={range.to} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="to">To</Label>
            <Input id="to" name="to" type="date" defaultValue={range.to} />
          </div>
          <button type="submit" className={buttonVariants()}>
            Show report
          </button>
          <ul className="flex flex-wrap gap-2" aria-label="Quick choices">
            {presets.map((p) => (
              <li key={p.label}>
                <Link
                  href={`/admin/reports?from=${p.from}&to=${p.to}`}
                  aria-current={p.from === range.from && p.to === range.to ? "true" : undefined}
                  className="inline-flex min-h-9 items-center rounded-lg border px-3 text-sm hover:bg-muted aria-[current=true]:bg-primary/10 aria-[current=true]:font-medium"
                >
                  {p.label}
                </Link>
              </li>
            ))}
          </ul>
        </form>
        <p role="status" className="text-sm text-muted-foreground">
          {range.adjusted ? `${range.adjusted} ` : ""}
          Showing {day(range.from)} to {day(range.to)} ({range.days}{" "}
          {range.days === 1 ? "day" : "days"}
          ), compared with the {range.days} {range.days === 1 ? "day" : "days"} before. Days end at
          midnight in India. Only paid orders count as sales.
        </p>

        <Section id="summary" title="Summary">
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Orders" value={String(s.orders.value)} c={s.orders} money={false} />
            <Stat
              label="Item sales"
              value={formatPaise(s.itemSalesPaise.value)}
              c={s.itemSalesPaise}
              note="Before discounts"
            />
            <Stat
              label="Discounts"
              value={formatPaise(s.discountPaise.value)}
              c={s.discountPaise}
            />
            <Stat
              label="Shipping charged"
              value={formatPaise(s.shippingPaise.value)}
              c={s.shippingPaise}
            />
            <Stat label="Refunded" value={formatPaise(s.refundedPaise.value)} c={s.refundedPaise} />
            <Stat
              label="Net sales"
              value={formatPaise(s.netPaise.value)}
              c={s.netPaise}
              note="Paid less refunds"
            />
            <Stat
              label="Average order"
              value={formatPaise(s.averageOrderPaise.value)}
              c={s.averageOrderPaise}
            />
            {s.profit ? (
              <Stat
                label="Estimated profit"
                value={formatPaise(s.profit.value.value)}
                c={s.profit.value}
                note={`From items with a purchase price: ${s.profit.coveredPct}% of item sales`}
              />
            ) : null}
          </dl>
        </Section>

        <Section id="daily" title="Sales by day" csv={csv("daily")}>
          <SalesAreaChart
            series={r.daily.map((d) => ({ date: d.date, revenuePaise: d.netPaise }))}
          />
          <details className="text-sm">
            <summary className="cursor-pointer py-1">Show as a table</summary>
            <Table
              caption="Sales by day"
              head={[
                { label: "Day" },
                { label: "Orders", right: true },
                { label: "Net sales", right: true },
              ]}
              rows={r.daily.map((d) => [day(d.date), d.orders, formatPaise(d.netPaise)])}
            />
          </details>
        </Section>

        <Section
          id="products"
          title="Best-selling products"
          help={
            products.length < r.products.length
              ? `The top 15 of ${r.products.length}. The spreadsheet has all of them.`
              : undefined
          }
          csv={csv("products")}
        >
          <Table
            caption="Best-selling products"
            head={[
              { label: "Product" },
              { label: "Sold", right: true },
              { label: "Item sales", right: true },
              ...(s.profit ? [{ label: "Profit", right: true }] : []),
            ]}
            rows={products.map((p) => [
              p.name,
              p.quantityText,
              formatPaise(p.salesPaise),
              ...(s.profit ? [formatPaise(p.profitPaise ?? 0)] : []),
            ])}
          />
        </Section>

        <Section
          id="categories"
          title="Sales by category"
          help="Each product counts in its first category, shown under its parent. Uses today's category, not the one on the day it sold."
          csv={csv("categories")}
        >
          {bucketTable("Category", r.categories, Boolean(s.profit))}
        </Section>
        <Section
          id="fabrics"
          title="Sales by fabric"
          help="Across every kind of product: cotton cloth, cotton dupattas and cotton blouses add up together."
          csv={csv("fabrics")}
        >
          {bucketTable("Fabric", r.fabrics, Boolean(s.profit))}
        </Section>
        <Section
          id="prints"
          title="Sales by print"
          help="Bandhani or ajrakh on any fabric, in any category."
          csv={csv("prints")}
        >
          {bucketTable("Print", r.prints, Boolean(s.profit))}
        </Section>

        <Section id="channels" title="Where sold">
          <Table
            caption="Sales online and in the shop"
            head={[
              { label: "Sold" },
              { label: "Orders", right: true },
              { label: "Net sales", right: true },
            ]}
            rows={r.channels.map((x) => [
              x.channel === "store" ? "In the shop" : "Online",
              x.orders,
              formatPaise(x.netPaise),
            ])}
          />
        </Section>

        <Section id="states" title="Where orders go" csv={csv("states")}>
          <Table
            caption="Sales by delivery state"
            head={[
              { label: "State" },
              { label: "Orders", right: true },
              { label: "Net sales", right: true },
            ]}
            rows={r.states.map((x) => [x.state, x.orders, formatPaise(x.netPaise)])}
          />
        </Section>

        <Section id="coupons" title="Coupons used" csv={csv("coupons")}>
          <Table
            caption="Coupons used"
            head={[
              { label: "Code" },
              { label: "Orders", right: true },
              { label: "Discount given", right: true },
              { label: "Net sales", right: true },
            ]}
            rows={r.coupons.map((c) => [
              c.code,
              c.orders,
              formatPaise(c.discountPaise),
              formatPaise(c.netPaise),
            ])}
            empty="No coupons were used in this period."
          />
        </Section>

        <Section
          id="checkout"
          title="Orders started and how they ended"
          help="An order is started when a customer presses Pay."
        >
          <Table
            caption="Orders started in the period"
            head={[
              { label: "Outcome" },
              { label: "Orders", right: true },
              { label: "Share", right: true },
            ]}
            rows={[
              ["Paid", r.checkout.paid],
              ["Waiting for payment", r.checkout.awaitingPayment],
              ["Payment failed", r.checkout.failed],
              ["Expired", r.checkout.expired],
              ["Cancelled before payment", r.checkout.cancelled],
              ["Something else", r.checkout.other],
              ["All started", r.checkout.started],
            ].map(([label, n]) => [
              label as string,
              n as number,
              pct(n as number, r.checkout.started),
            ])}
          />
        </Section>

        {r.customers ? (
          <Section
            id="customers"
            title="Who bought"
            help="A first-time buyer has no earlier paid order. A returning buyer has at least one."
          >
            <Table
              caption="Buyers in the period"
              head={[{ label: "Buyers" }, { label: "People", right: true }]}
              rows={[
                ["All buyers", r.customers.buyers],
                ["First-time", r.customers.first],
                ["Returning", r.customers.returning],
                ["Returning share", pct(r.customers.returning, r.customers.buyers)],
              ]}
            />
          </Section>
        ) : null}

        <Section id="aftercare" title="After the sale">
          <Table
            caption="Deliveries, returns and refunds"
            head={[{ label: "Measure" }, { label: "Figure", right: true }]}
            rows={[
              ["Orders delivered in the period", r.aftercare.delivered],
              ["Paid orders not yet delivered", r.aftercare.undelivered],
              ["Return requests made", r.aftercare.returnRequests],
              ["Refunds paid out", r.aftercare.refundCount],
              ["Amount refunded", formatPaise(r.aftercare.refundsPaise)],
            ]}
          />
        </Section>
      </div>
    )
  }
)
