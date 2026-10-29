import { PageTitle, staffPage } from "@/components/admin/staff-page"
import { CategoryForm } from "@/components/admin/other-forms"
import { listCategoriesAdmin } from "@/services/admin-catalog-service"

export default staffPage<object>("catalog:write", async ({ actor }) => {
  const tops = (await listCategoriesAdmin(actor)).filter((c) => !c.parentId)
  return (
    <>
      <PageTitle
        title="New category"
        crumbs={[{ label: "Categories", href: "/admin/categories" }, { label: "New category" }]}
      />
      <CategoryForm
        values={{}}
        categories={tops.map((c) => ({ value: String(c._id), label: c.name }))}
      />
    </>
  )
})
