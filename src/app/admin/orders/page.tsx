import Link from "next/link"
import { cn } from "cn"
import { buttonVariants } from "@/components/ui/button"
import { Pagination } from "@/components/admin/pagination"
import { PageTitle, staffPage } from "@/components/admin/staff-page"
import { statusLabel } from "@/components/orders-status"
import { roleHasPermission } from "@/config/permissions"
import { formatPaise } from "@/lib/money"
import { listOrdersForStaff } from "@/services/order-detail-service"

const FILTERS = [
  { key: "all", label: "All orders" },
  { key: "to_ship", label: "To ship" },
  { key: "returns", label: "Returns to handle" },
  { key: "in_store", label: "In store" },
] as const

const tone = {
  good: "bg-[#e4f5ec] text-[#0e6b46]",
  wait: "bg-[#fff1de] text-[#8a5a00]",
  bad: "bg-[#fdecea] text-[#b3261e]",
} as const

const date = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(
    new Date(iso)
  )

export default staffPage<{ searchParams: Promise<{ show?: string; page?: string }> }>(
  "orders:read",
  async ({ actor, props }) => {
    const { show, page } = await props.searchParams
    const filter = FILTERS.find((f) => f.key === show)?.key ?? "all"
    const current = Math.max(1, Number.parseInt(page ?? "1", 10) || 1)
    const { rows, total, pageSize } = await listOrdersForStaff(actor, filter, current)
    return (
      <>
        <PageTitle title="Orders" crumbs={[{ label: "Orders" }]}>
          {roleHasPermission(actor.role, "orders:create_offline") ? (
            <Link href="/admin/orders/new" className={buttonVariants()}>
              Add order
            </Link>
          ) : null}
        </PageTitle>
        <nav aria-label="Order filters" className="mb-5 flex flex-wrap gap-2 text-sm">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={f.key === "all" ? "/admin/orders" : `/admin/orders?show=${f.key}`}
              aria-current={f.key === filter ? "page" : undefined}
              className={cn(
                "rounded-lg border px-3 py-1.5",
                f.key === filter ? "border-primary bg-primary/10" : "hover:bg-muted"
              )}
            >
              {f.label}
            </Link>
          ))}
        </nav>
        {rows.length === 0 ? (
          <p className="text-muted-foreground">Nothing here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
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
                {rows.map((o) => {
                  const s = statusLabel(o)
                  return (
                    <tr key={o.orderNumber}>
                      <td className="py-3">
                        <Link
                          href={`/admin/orders/${o.orderNumber}`}
                          className="text-base underline-offset-4 hover:underline"
                        >
                          {o.orderNumber}
                        </Link>
                      </td>
                      <td className="py-3">
                        {o.customer}
                        <span className="block text-xs text-muted-foreground">
                          {o.channel === "store" ? "Sold in the shop" : o.email}
                        </span>
                      </td>
                      <td className="py-3 text-muted-foreground">{date(o.createdAt)}</td>
                      <td className="tabular py-3 text-right">{formatPaise(o.totalPaise)}</td>
                      <td className="py-3 pl-4">
                        <span className={cn("rounded-full px-2.5 py-1 text-xs", tone[s.tone])}>
                          {s.label}
                        </span>
                        {o.channel === "store" ? (
                          <span className="ml-2 rounded-full bg-muted px-2.5 py-1 text-xs">
                            In store
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          basePath="/admin/orders"
          params={{ show: filter === "all" ? undefined : filter }}
          page={current}
          total={total}
          pageSize={pageSize}
        />
      </>
    )
  }
)
