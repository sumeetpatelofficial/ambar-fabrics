import Link from "next/link"
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  IndianRupee,
  Receipt,
  TrendingUp,
  ShoppingBag,
  UserPlus,
  type LucideIcon,
} from "lucide-react"
import { cn } from "cn"
import { SalesAreaChart } from "@/components/admin/charts/sales-area-chart"
import { SegmentsDonut } from "@/components/admin/charts/segments-donut"
import { ACCENT, avatarColor, tint, type Accent } from "@/components/admin/colors"
import { staffPage } from "@/components/admin/staff-page"
import { statusLabel } from "@/components/orders-status"
import { ProductArt } from "@/components/storefront/product-art"
import { formatPaise } from "@/lib/money"
import { getOverview, parseRange, RANGES, type Compared } from "@/services/admin-dashboard-service"

const date = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(
    new Date(iso)
  )
const short = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso))

function Delta({ c }: { c: Compared }) {
  if (c.previous === 0 && c.value === 0)
    return <span className="text-xs text-muted-foreground">No change</span>
  if (c.previous === 0)
    return (
      <span className="text-xs font-medium" style={{ color: ACCENT.green.ink }}>
        New this period
      </span>
    )
  const pct = ((c.value - c.previous) / c.previous) * 100
  const up = pct >= 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span
      className="inline-flex items-center gap-0.5 text-xs font-medium"
      style={{ color: up ? ACCENT.green.ink : ACCENT.red.ink }}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {Math.abs(pct).toFixed(1)}%<span className="sr-only">{up ? " up" : " down"}</span>
      <span className="ml-1 font-normal text-muted-foreground">vs the period before</span>
    </span>
  )
}

function Kpi({
  icon: Icon,
  accent,
  label,
  value,
  delta,
  note,
}: {
  icon: LucideIcon
  accent: Accent
  label: string
  value: string
  delta: Compared
  note?: string
}) {
  return (
    <li className="flex items-start gap-4 rounded-2xl border bg-background p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <span
        aria-hidden="true"
        className="flex size-12 shrink-0 items-center justify-center rounded-xl"
        style={tint(accent)}
      >
        <Icon className="size-5" strokeWidth={1.9} />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="tabular text-2xl font-medium">{value}</p>
        <Delta c={delta} />
        {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      </div>
    </li>
  )
}

function Card({
  title,
  action,
  children,
  className,
}: {
  title: string
  action?: { href: string; label: string }
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border bg-background p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]",
        className
      )}
      aria-label={title}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-sans text-base font-semibold">{title}</h2>
        {action ? (
          <Link
            href={action.href}
            className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted"
          >
            {action.label}
            <ChevronRight aria-hidden="true" className="size-3.5" />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  )
}

const TONE: Record<"good" | "wait" | "bad", Accent> = { good: "green", wait: "amber", bad: "red" }
/** Colour the status by what it says: delivered green, on its way blue, waiting amber, trouble red. */
function statusAccent(fulfillment: string, tone: "good" | "wait" | "bad"): Accent {
  if (fulfillment === "shipped" || fulfillment === "out_for_delivery") return "blue"
  if (fulfillment === "packed") return "violet"
  return TONE[tone]
}

export default staffPage<{ searchParams: Promise<{ range?: string }> }>(
  undefined,
  async ({ actor, props }) => {
    const range = parseRange((await props.searchParams).range)
    const o = await getOverview(actor, range)
    const todo: { label: string; n: number | undefined; href: string; accent: Accent }[] = [
      {
        label: "Orders to ship",
        n: o.attention.toShip,
        href: "/admin/orders?show=to_ship",
        accent: "blue",
      },
      {
        label: "Returns to handle",
        n: o.attention.returns,
        href: "/admin/orders?show=returns",
        accent: "violet",
      },
      {
        label: "Orders needing a look",
        n: o.attention.needsAttention,
        href: "/admin/orders",
        accent: "red",
      },
      { label: "Reviews to read", n: o.attention.reviews, href: "/admin/reviews", accent: "amber" },
    ]
    const shown = todo.filter((t) => t.n !== undefined)
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl">Overview</h1>
          {o.kpis ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="inline-flex items-center gap-2 rounded-xl border bg-background px-3 py-2 text-sm">
                <CalendarDays aria-hidden="true" className="size-4 text-muted-foreground" />
                <span className="sr-only">Period: </span>
                {short(o.from)} to {short(new Date(new Date(o.to).getTime() - 1).toISOString())}
              </p>
              <nav
                aria-label="Time period"
                className="flex flex-wrap gap-1 rounded-xl border bg-background p-1 text-sm"
              >
                {(Object.keys(RANGES) as (keyof typeof RANGES)[]).map((k) => (
                  <Link
                    key={k}
                    href={k === "30d" ? "/admin" : `/admin?range=${k}`}
                    aria-current={k === range ? "true" : undefined}
                    className={cn(
                      "rounded-lg px-3 py-1.5",
                      k === range ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                    )}
                  >
                    {RANGES[k].label}
                  </Link>
                ))}
              </nav>
            </div>
          ) : null}
        </div>

        {shown.length ? (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Waiting for you">
            {shown.map((t) => {
              const hot = (t.n ?? 0) > 0
              return (
                <li key={t.label}>
                  <Link
                    href={t.href}
                    className="flex items-center justify-between gap-3 rounded-2xl border bg-background px-5 py-4 hover:bg-muted/60"
                    style={hot ? { borderColor: `${ACCENT[t.accent].solid}66` } : undefined}
                  >
                    <span className="text-sm text-muted-foreground">{t.label}</span>
                    <span
                      className="tabular rounded-full px-3 py-0.5 text-lg font-medium"
                      style={hot ? tint(t.accent) : { color: ACCENT.grey.ink }}
                    >
                      {t.n}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : null}

        {o.kpis ? (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Key figures">
            <Kpi
              icon={IndianRupee}
              accent="green"
              label="Total sales"
              value={formatPaise(o.kpis.revenuePaise.value)}
              delta={o.kpis.revenuePaise}
            />
            <Kpi
              icon={ShoppingBag}
              accent="blue"
              label="Orders"
              value={String(o.kpis.orders.value)}
              delta={o.kpis.orders}
            />
            {o.kpis.newCustomers ? (
              <Kpi
                icon={UserPlus}
                accent="violet"
                label="New customers"
                value={String(o.kpis.newCustomers.value)}
                delta={o.kpis.newCustomers}
              />
            ) : null}
            {o.kpis.profit ? (
              <Kpi
                icon={TrendingUp}
                accent="green"
                label="Estimated profit"
                value={formatPaise(o.kpis.profit.value.value)}
                delta={o.kpis.profit.value}
                note={
                  o.kpis.profit.coveredPct < 100
                    ? `Counts ${o.kpis.profit.coveredPct}% of sales; the rest has no purchase price yet.`
                    : "Sales minus what the goods cost."
                }
              />
            ) : null}
            <Kpi
              icon={Receipt}
              accent="amber"
              label="Average order"
              value={formatPaise(o.kpis.averageOrderPaise.value)}
              delta={o.kpis.averageOrderPaise}
            />
          </ul>
        ) : null}

        {o.series || o.stockAlerts ? (
          <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
            {o.series && o.kpis ? (
              <Card title="Sales overview" className="min-w-0">
                <div className="-mt-1 mb-3 flex flex-wrap items-baseline gap-3">
                  <p className="tabular text-3xl font-medium">
                    {formatPaise(o.kpis.revenuePaise.value)}
                  </p>
                  <Delta c={o.kpis.revenuePaise} />
                </div>
                <SalesAreaChart series={o.series} />
              </Card>
            ) : null}
            {o.stockAlerts ? (
              <Card
                title="Inventory alerts"
                action={{ href: "/admin/inventory?show=low", label: "View all" }}
              >
                {o.stockAlerts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Everything is well stocked.</p>
                ) : (
                  <ul className="flex flex-col divide-y">
                    {o.stockAlerts.map((a) => (
                      <li key={a.variantId} className="flex items-center gap-3 py-3 text-sm">
                        <span className="relative size-11 shrink-0 overflow-hidden rounded-lg bg-muted">
                          <ProductArt
                            product={{
                              name: a.name,
                              swatches: a.swatch ? [{ name: "", hex: a.swatch }] : [],
                            }}
                            image={a.imageUrl ? { url: a.imageUrl, alt: "" } : null}
                            sizes="44px"
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <Link
                            href={`/admin/inventory?q=${encodeURIComponent(a.sku)}`}
                            className="block truncate font-medium underline-offset-4 hover:underline"
                          >
                            {a.name}
                          </Link>
                          <span className="text-xs text-muted-foreground">
                            {a.out ? "Out of stock" : "Stock running low"}
                          </span>
                        </span>
                        <span
                          className="tabular shrink-0 text-sm font-medium"
                          style={{ color: a.out ? ACCENT.red.ink : ACCENT.amber.ink }}
                        >
                          {a.out ? "0 left" : a.availableText}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            ) : null}
          </div>
        ) : null}

        {o.recentOrders || o.segments ? (
          <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
            {o.recentOrders ? (
              <Card
                title="Recent orders"
                action={{ href: "/admin/orders", label: "View all" }}
                className="min-w-0"
              >
                {o.recentOrders.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No orders yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[34rem] text-left text-sm">
                      <thead className="text-xs text-muted-foreground">
                        <tr>
                          <th scope="col" className="pb-2 font-normal">
                            Order
                          </th>
                          <th scope="col" className="pb-2 font-normal">
                            Customer
                          </th>
                          <th scope="col" className="pb-2 font-normal">
                            Date
                          </th>
                          <th scope="col" className="pb-2 text-right font-normal">
                            Amount
                          </th>
                          <th scope="col" className="pb-2 pl-4 font-normal">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {o.recentOrders.map((r) => {
                          const s = statusLabel({
                            status: r.status as never,
                            paymentStatus: r.paymentStatus as never,
                            fulfillmentStatus: r.fulfillment,
                          })
                          return (
                            <tr key={r.orderNumber}>
                              <td className="py-3">
                                <Link
                                  href={`/admin/orders/${r.orderNumber}`}
                                  className="underline-offset-4 hover:underline"
                                >
                                  {r.orderNumber}
                                </Link>
                              </td>
                              <td className="py-3">
                                <span className="flex items-center gap-2">
                                  <span
                                    aria-hidden="true"
                                    className="flex size-7 items-center justify-center rounded-full text-xs text-white"
                                    style={{ backgroundColor: avatarColor(r.customer) }}
                                  >
                                    {r.customer.trim().charAt(0).toUpperCase()}
                                  </span>
                                  {r.customer}
                                </span>
                              </td>
                              <td className="py-3 text-muted-foreground">{date(r.date)}</td>
                              <td className="tabular py-3 text-right">
                                {formatPaise(r.totalPaise)}
                              </td>
                              <td className="py-3 pl-4">
                                <span
                                  className="rounded-full px-2.5 py-1 text-xs font-medium"
                                  style={tint(statusAccent(r.fulfillment, s.tone))}
                                >
                                  {s.label}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            ) : null}
            {o.segments ? (
              <Card title="Customer segments">
                <SegmentsDonut segments={o.segments} />
              </Card>
            ) : null}
          </div>
        ) : null}

        {o.top ? (
          <Card
            title="Top products"
            action={{ href: "/admin/products", label: "View all products" }}
          >
            {o.top.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sales in this period yet.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
                {o.top.map((p) => (
                  <li key={p.productId} className="flex flex-col gap-2 rounded-xl border p-2">
                    <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-muted">
                      <ProductArt
                        product={{
                          name: p.name,
                          swatches: p.swatch ? [{ name: "", hex: p.swatch }] : [],
                        }}
                        image={p.imageUrl ? { url: p.imageUrl, alt: p.name } : null}
                        sizes="(min-width: 1280px) 15vw, 40vw"
                      />
                    </div>
                    <p className="truncate px-1 text-sm font-medium">{p.name}</p>
                    <p className="px-1 text-xs text-muted-foreground">{p.unitsText} sold</p>
                    <p
                      className="tabular px-1 pb-1 text-sm font-medium"
                      style={{ color: ACCENT.green.ink }}
                    >
                      {formatPaise(p.revenuePaise)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}

        {!o.kpis && !o.recentOrders && !o.stockAlerts ? (
          <p className="text-muted-foreground">Your role has no dashboard figures.</p>
        ) : null}
      </div>
    )
  },
  { bare: true }
)
