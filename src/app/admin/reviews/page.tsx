import Link from "next/link"
import { PageTitle, staffPage } from "@/components/admin/staff-page"
import { ReviewActions } from "@/components/admin/row-actions"
import { Stars } from "@/components/storefront/stars"
import type { ModerationRow } from "@/services/review-service"
import { Pagination } from "@/components/admin/pagination"
import { listForModerationPage } from "@/services/review-service"

const TABS: { key: ModerationRow["status"]; label: string }[] = [
  { key: "pending", label: "Waiting" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Refused" },
]

export default staffPage<{ searchParams: Promise<{ show?: string; page?: string }> }>(
  "reviews:moderate",
  async ({ actor, props }) => {
    const { show, page } = await props.searchParams
    const current = Math.max(1, Number.parseInt(page ?? "1", 10) || 1)
    const status = TABS.find((t) => t.key === show)?.key ?? "pending"
    const { rows, total, pageSize } = await listForModerationPage(actor, status, current)
    return (
      <>
        <PageTitle title="Reviews" crumbs={[{ label: "Reviews" }]} />
        <nav aria-label="Review filters" className="mb-4 flex gap-2 text-sm">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/admin/reviews?show=${t.key}`}
              aria-current={t.key === status ? "page" : undefined}
              className={
                t.key === status
                  ? "border border-primary bg-primary/10 px-3 py-1.5"
                  : "border px-3 py-1.5"
              }
            >
              {t.label}
            </Link>
          ))}
        </nav>
        {rows.length === 0 ? (
          <p className="text-muted-foreground">Nothing here.</p>
        ) : (
          <ul className="divide-y border-y">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 py-4 text-sm">
                <p>
                  <Link
                    href={`/products/${r.productSlug}`}
                    className="text-lg underline-offset-4 hover:underline"
                  >
                    {r.productName}
                  </Link>
                  <span className="text-muted-foreground"> by {r.author}</span>
                </p>
                <Stars value={r.rating} />
                {r.title ? <p className="font-medium">{r.title}</p> : null}
                <p className="max-w-prose whitespace-pre-line">{r.body}</p>
                <ReviewActions id={r.id} status={r.status} />
              </li>
            ))}
          </ul>
        )}
        <Pagination
          basePath="/admin/reviews"
          params={{ show: status === "pending" ? undefined : status }}
          page={current}
          total={total}
          pageSize={pageSize}
        />
      </>
    )
  }
)
