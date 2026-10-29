import { Pagination } from "@/components/admin/pagination"
import { StatusButton } from "@/components/admin/row-actions"
import { PageTitle, staffPage } from "@/components/admin/staff-page"
import { buttonVariants } from "@/components/ui/button"
import { roleHasPermission } from "@/config/permissions"
import { listCustomersPage } from "@/services/admin-ops-service"

const date = (d?: Date) =>
  d
    ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(d)
    : "never"

const hue = (s: string) => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 360, 7)

export default staffPage<{ searchParams: Promise<{ q?: string; page?: string }> }>(
  "customers:read",
  async ({ actor, props }) => {
    const { q, page } = await props.searchParams
    const current = Math.max(1, Number.parseInt(page ?? "1", 10) || 1)
    const { rows, total, pageSize } = await listCustomersPage(actor, { q, page: current })
    const canSuspend = roleHasPermission(actor.role, "customers:suspend")
    return (
      <>
        <PageTitle title="Customers" crumbs={[{ label: "Customers" }]} />
        <form className="mb-4 flex gap-2" role="search" aria-label="Search customers">
          <input
            name="q"
            defaultValue={q}
            aria-label="Search by name or email"
            placeholder="Search"
            className="h-10 min-w-56 border border-input bg-background px-3"
          />
          <button className={buttonVariants({ variant: "outline" })}>Search</button>
        </form>
        <ul className="divide-y border-y">
          {rows.map((u) => (
            <li
              key={u.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
            >
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex size-10 items-center justify-center rounded-full text-sm text-white"
                  style={{ backgroundColor: `hsl(${hue(u.email)} 45% 38%)` }}
                >
                  {u.name.trim().charAt(0).toUpperCase() || "?"}
                </span>
                <div>
                  <p className="text-base">{u.name}</p>
                  <p className="text-muted-foreground">
                    {u.email}, {u.role.replace("_", " ")}, joined {date(u.createdAt)}, last seen{" "}
                    {date(u.lastLoginAt)}, {u.orders} {u.orders === 1 ? "order" : "orders"}
                    {u.status === "suspended" ? ", suspended" : ""}
                  </p>
                </div>
              </div>
              {canSuspend && u.id !== actor.id ? (
                <StatusButton userId={u.id} status={u.status} name={u.name} />
              ) : null}
            </li>
          ))}
        </ul>
        <Pagination
          basePath="/admin/customers"
          params={{ q }}
          page={current}
          total={total}
          pageSize={pageSize}
        />
      </>
    )
  }
)
