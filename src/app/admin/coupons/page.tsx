import Link from "next/link"
import { PageTitle, staffPage } from "@/components/admin/staff-page"
import { buttonVariants } from "@/components/ui/button"
import { formatPaise } from "@/lib/money"
import { Pagination } from "@/components/admin/pagination"
import { listCouponsPage } from "@/services/admin-ops-service"

export default staffPage<{ searchParams: Promise<{ saved?: string; page?: string }> }>(
  "coupons:manage",
  async ({ actor, props }) => {
    const { saved, page } = await props.searchParams
    const current = Math.max(1, Number.parseInt(page ?? "1", 10) || 1)
    const { rows: coupons, total, pageSize } = await listCouponsPage(actor, current)
    return (
      <>
        <PageTitle title="Coupons" crumbs={[{ label: "Coupons" }]}>
          <Link href="/admin/coupons/new" className={buttonVariants()}>
            New coupon
          </Link>
        </PageTitle>
        {saved ? (
          <p role="status" className="mb-4 border border-primary/40 bg-primary/5 p-3 text-sm">
            Saved.
          </p>
        ) : null}
        {coupons.length === 0 ? (
          <p className="text-muted-foreground">No coupons yet.</p>
        ) : (
          <ul className="divide-y border-y">
            {coupons.map((c) => (
              <li
                key={String(c._id)}
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
              >
                <div>
                  <Link
                    href={`/admin/coupons/${c._id}`}
                    className="text-lg underline-offset-4 hover:underline"
                  >
                    {c.code}
                  </Link>
                  <p className="text-muted-foreground">
                    {c.type === "percent"
                      ? `${c.percent}% off`
                      : `${formatPaise(c.amountPaise ?? 0)} off`}
                    {c.minOrderPaise ? `, over ${formatPaise(c.minOrderPaise)}` : ""}, used{" "}
                    {c.usedCount}
                    {c.usageLimit ? ` of ${c.usageLimit}` : ""} times
                  </p>
                </div>
                <p>
                  {c.active ? "Active" : "Off"}
                  {c.showOnHome ? ", on the home page" : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
        <Pagination basePath="/admin/coupons" page={current} total={total} pageSize={pageSize} />
      </>
    )
  }
)
