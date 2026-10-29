import { Pagination } from "@/components/admin/pagination"
import { PageTitle, staffPage } from "@/components/admin/staff-page"
import { buttonVariants } from "@/components/ui/button"
import { listAuditLog } from "@/services/admin-ops-service"

const when = (d: Date) =>
  new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Kolkata",
  }).format(d)

export default staffPage<{ searchParams: Promise<{ action?: string; page?: string }> }>(
  "auditlogs:read",
  async ({ actor, props }) => {
    const { action, page } = await props.searchParams
    const current = Math.max(1, Number.parseInt(page ?? "1", 10) || 1)
    const { rows, total, pageSize } = await listAuditLog(actor, { action, page: current })
    return (
      <>
        <PageTitle title="Audit log" crumbs={[{ label: "Audit log" }]} />
        <form className="mb-4 flex gap-2" role="search" aria-label="Filter the audit log">
          <input
            name="action"
            defaultValue={action}
            aria-label="Starts with"
            placeholder="For example product. or refund."
            className="h-10 border border-input bg-background px-3"
          />
          <button className={buttonVariants({ variant: "outline" })}>Filter</button>
        </form>
        <ul className="divide-y border-y">
          {rows.map((r) => (
            <li key={String(r._id)} className="py-2 text-sm">
              <span className="font-medium">{r.action}</span>
              <span className="text-muted-foreground">
                {" "}
                by {r.actorEmail ?? "system"} ({r.actorRole ?? "none"}), {when(r.at)}
                {r.entityType ? `, ${r.entityType} ${r.entityId ?? ""}` : ""}
              </span>
            </li>
          ))}
        </ul>
        <Pagination
          basePath="/admin/audit"
          params={{ action }}
          page={current}
          total={total}
          pageSize={pageSize}
        />
      </>
    )
  }
)
