import { notFound } from "next/navigation"
import { PageTitle, staffPage } from "@/components/admin/staff-page"
import { CategoryForm } from "@/components/admin/other-forms"
import { categoryToForm } from "@/features/admin/mappers"
import { NotFoundError } from "@/lib/errors"
import { getCategoryAdmin, listCategoriesAdmin } from "@/services/admin-catalog-service"

export default staffPage<{ params: Promise<{ id: string }> }>(
  "catalog:write",
  async ({ actor, props }) => {
    const { id } = await props.params
    try {
      const category = await getCategoryAdmin(actor, id)
      const all = await listCategoriesAdmin(actor)
      const tops = all.filter((c) => !c.parentId && String(c._id) !== id)
      // Categories, then the one it sits under (Fabrics), then this one (Cotton): Back goes up a level.
      const parent = category.parentId
        ? all.find((c) => String(c._id) === String(category.parentId))
        : undefined
      return (
        <>
          <PageTitle
            title={category.name}
            crumbs={[
              { label: "Categories", href: "/admin/categories" },
              ...(parent ? [{ label: parent.name, href: `/admin/categories/${parent._id}` }] : []),
              { label: category.name },
            ]}
          />
          <CategoryForm
            values={categoryToForm(category)}
            categories={tops.map((c) => ({ value: String(c._id), label: c.name }))}
          />
        </>
      )
    } catch (error) {
      if (error instanceof NotFoundError) notFound()
      throw error
    }
  }
)
