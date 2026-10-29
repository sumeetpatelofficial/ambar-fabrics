import { ChoiceSelect } from "@/components/ui/choice-select"
import Link from "next/link"
import { PageTitle, staffPage } from "@/components/admin/staff-page"
import { StockForm } from "@/components/admin/other-forms"
import { buttonVariants } from "@/components/ui/button"
import { roleHasPermission } from "@/config/permissions"
import { Pagination } from "@/components/admin/pagination"
import { listStockPage } from "@/services/admin-ops-service"

type Props = { searchParams: Promise<{ show?: string; q?: string; page?: string }> }

export default staffPage<Props>("inventory:read", async ({ actor, props }) => {
  const { show, q, page } = await props.searchParams
  const current = Math.max(1, Number.parseInt(page ?? "1", 10) || 1)
  const filter = show === "low" || show === "out" ? show : "all"
  const { rows, total, pageSize } = await listStockPage(actor, { show: filter, q, page: current })
  const canAdjust = roleHasPermission(actor.role, "inventory:adjust")
  return (
    <>
      <PageTitle title="Inventory" crumbs={[{ label: "Inventory" }]}>
        <a href="/admin/inventory/export" className={buttonVariants({ variant: "outline" })}>
          Download spreadsheet
        </a>
      </PageTitle>
      <form className="mb-4 flex flex-wrap gap-2" role="search" aria-label="Search stock">
        <input
          name="q"
          defaultValue={q}
          aria-label="Search by name or SKU"
          placeholder="Search"
          className="h-10 border border-input bg-background px-3"
        />
        <ChoiceSelect name="show" defaultValue={filter} aria-label="Show" className="w-44">
          <option value="all">All items</option>
          <option value="low">Running low</option>
          <option value="out">Out of stock</option>
        </ChoiceSelect>
        <button className={buttonVariants({ variant: "outline" })}>Show</button>
      </form>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">Nothing here.</p>
      ) : (
        <ul className="divide-y border-y">
          {rows.map((r) => (
            <li key={r.variantId} className="py-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link
                    href={`/products/${r.slug}`}
                    className="text-lg underline-offset-4 hover:underline"
                  >
                    {r.productName}
                  </Link>
                  <p className="text-muted-foreground">
                    {r.sku}
                    {r.label ? `, ${r.label}` : ""}
                  </p>
                </div>
                <p className="tabular text-right">
                  {r.available} available
                  <span className="block text-muted-foreground">
                    {r.onHand} on hand, {r.reserved} held for orders
                  </span>
                  {r.status !== "ok" ? (
                    <span className="block text-madder">
                      {r.status === "out" ? "Out of stock" : "Running low"}
                    </span>
                  ) : null}
                </p>
              </div>
              {canAdjust ? (
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm underline underline-offset-4">
                    Change stock for {r.sku}
                  </summary>
                  <div className="mt-2">
                    <StockForm
                      variantId={r.variantId}
                      unitHint={r.onHand.endsWith(" m") ? "metres" : "pieces"}
                    />
                  </div>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <Pagination
        basePath="/admin/inventory"
        params={{ q, show: filter === "all" ? undefined : filter }}
        page={current}
        total={total}
        pageSize={pageSize}
      />
    </>
  )
})
