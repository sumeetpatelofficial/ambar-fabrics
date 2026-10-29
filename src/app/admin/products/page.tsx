import { ChoiceSelect } from "@/components/ui/choice-select"
import Link from "next/link"
import { Plus } from "lucide-react"
import { cn } from "cn"
import { Pagination } from "@/components/admin/pagination"
import { PageTitle, staffPage } from "@/components/admin/staff-page"
import { buttonVariants } from "@/components/ui/button"
import { ProductArt } from "@/components/storefront/product-art"
import { roleHasPermission } from "@/config/permissions"
import { formatPaise } from "@/lib/money"
import { listProductsAdmin } from "@/services/admin-catalog-service"

type Props = { searchParams: Promise<{ q?: string; status?: string; page?: string }> }

const STATUS = {
  active: { label: "Active", style: "bg-[#e4f5ec] text-[#0e6b46]" },
  draft: { label: "Draft", style: "bg-[#fff1de] text-[#8a5a00]" },
  archived: { label: "Archived", style: "bg-[#eceff3] text-[#4b5563]" },
} as const

export default staffPage<Props>("catalog:read", async ({ actor, props }) => {
  const { q, status, page } = await props.searchParams
  const current = Math.max(1, Number.parseInt(page ?? "1", 10) || 1)
  const { rows, total, pageSize } = await listProductsAdmin(actor, { q, status, page: current })
  return (
    <>
      <PageTitle title="Products" crumbs={[{ label: "Products" }]}>
        {roleHasPermission(actor.role, "catalog:write") ? (
          <Link href="/admin/products/new" className={buttonVariants()}>
            <Plus aria-hidden="true" className="size-4" /> New product
          </Link>
        ) : null}
      </PageTitle>
      <form className="mb-6 flex flex-wrap gap-2" role="search" aria-label="Search products">
        <input
          name="q"
          defaultValue={q}
          aria-label="Search by name or address"
          placeholder="Search products"
          className="h-10 min-w-56 border border-input bg-background px-3"
        />
        <ChoiceSelect
          name="status"
          defaultValue={status ?? ""}
          aria-label="Status"
          className="w-44"
        >
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </ChoiceSelect>
        <button className={buttonVariants({ variant: "outline" })}>Search</button>
      </form>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">No products match.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {rows.map((p) => {
            const s = STATUS[p.status]
            return (
              <li
                key={p.id}
                className="group relative flex flex-col overflow-hidden rounded-xl border bg-background transition-shadow focus-within:ring-2 focus-within:ring-ring hover:shadow-md"
              >
                <div className="relative aspect-[4/3] bg-muted">
                  <ProductArt
                    product={{
                      name: p.name,
                      swatches: p.swatch ? [{ name: "", hex: p.swatch }] : [],
                    }}
                    image={p.imageUrl ? { url: p.imageUrl, alt: p.imageAlt ?? p.name } : null}
                    sizes="(min-width: 1536px) 18vw, (min-width: 1280px) 22vw, (min-width: 768px) 30vw, 46vw"
                  />
                  <span
                    className={cn(
                      "absolute top-2 left-2 rounded-full px-2.5 py-1 text-xs",
                      s.style
                    )}
                  >
                    {s.label}
                  </span>
                  {!p.inStock && p.status === "active" ? (
                    <span className="absolute right-2 bottom-2 rounded-full bg-[#fdecea] px-2.5 py-1 text-xs text-[#b3261e]">
                      Out of stock
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-1 flex-col gap-1 p-3">
                  <h2 className="font-sans text-[0.95rem] leading-snug font-medium">
                    <Link
                      href={`/admin/products/${p.id}`}
                      className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
                    >
                      {p.name}
                    </Link>
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {p.category ?? "No category"}, {p.variants}{" "}
                    {p.variants === 1 ? "variant" : "variants"}
                  </p>
                  <p className="tabular mt-auto pt-1 text-sm text-primary">
                    {p.priceRange
                      ? `${formatPaise(p.priceRange.minPaise)} ${p.unitLabel ?? ""}`
                      : "No price yet"}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <Pagination
        basePath="/admin/products"
        params={{ q, status }}
        page={current}
        total={total}
        pageSize={pageSize}
      />
    </>
  )
})
