import Link from "next/link"
import { Plus } from "lucide-react"
import { CategoryTree, type CategoryInfo } from "@/components/admin/category-tree"
import { PageTitle, staffPage } from "@/components/admin/staff-page"
import { buttonVariants } from "@/components/ui/button"
import { roleHasPermission } from "@/config/permissions"
import type { Layout } from "@/lib/tree-order"
import { categoryProductCounts, listCategoriesAdmin } from "@/services/admin-catalog-service"

export default staffPage<{ searchParams: Promise<{ saved?: string }> }>(
  "catalog:read",
  async ({ actor, props }) => {
    const { saved } = await props.searchParams
    const [all, counts] = await Promise.all([
      listCategoriesAdmin(actor),
      categoryProductCounts(actor),
    ])
    const canEdit = roleHasPermission(actor.role, "catalog:write")
    const byOrder = (
      a: { sortOrder: number; name: string },
      b: { sortOrder: number; name: string }
    ) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
    const tops = all.filter((c) => !c.parentId).sort(byOrder)
    const layout: Layout = tops.map((t) => ({
      id: String(t._id),
      children: all
        .filter((c) => c.parentId && String(c.parentId) === String(t._id))
        .sort(byOrder)
        .map((c) => String(c._id)),
    }))
    const info: Record<string, CategoryInfo> = Object.fromEntries(
      all.map((c) => [
        String(c._id),
        {
          id: String(c._id),
          name: c.name,
          hidden: c.status === "hidden",
          products: counts[String(c._id)] ?? 0,
        },
      ])
    )
    return (
      <>
        <PageTitle title="Categories" crumbs={[{ label: "Categories" }]}>
          {canEdit ? (
            <Link href="/admin/categories/new" className={buttonVariants()}>
              <Plus aria-hidden="true" className="size-4" /> New category
            </Link>
          ) : null}
        </PageTitle>
        {saved ? (
          <p role="status" className="mb-4 border border-primary/40 bg-primary/5 p-3 text-sm">
            Saved.
          </p>
        ) : null}
        <p className="mb-4 max-w-2xl text-sm text-muted-foreground">
          Categories say what a thing is (a dupatta, a blouse, a kurti). What it is made of and how
          it is printed are set in{" "}
          <Link href="/admin/fabrics" className="underline underline-offset-4">
            Fabrics
          </Link>{" "}
          and{" "}
          <Link href="/admin/prints" className="underline underline-offset-4">
            Prints
          </Link>
          , and work across every category.
        </p>
        {canEdit ? (
          <CategoryTree initial={layout} info={info} />
        ) : (
          <ul className="divide-y border-y">
            {layout.map((t) => (
              <li key={t.id} className="py-3">
                <Link
                  href={`/admin/categories/${t.id}`}
                  className="text-lg underline-offset-4 hover:underline"
                >
                  {info[t.id]!.name}
                </Link>
                <ul className="mt-1 ml-4 text-sm">
                  {t.children.map((c) => (
                    <li key={c}>
                      <Link
                        href={`/admin/categories/${c}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {info[c]!.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </>
    )
  }
)
