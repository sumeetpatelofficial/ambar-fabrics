import { PageTitle, staffPage } from "@/components/admin/staff-page"
import { CollectionForm } from "@/components/admin/other-forms"
import { listCategoriesAdmin } from "@/services/admin-catalog-service"

export default staffPage<object>("catalog:write", async ({ actor }) => {
  const categories = await listCategoriesAdmin(actor)
  return (
    <>
      <PageTitle
        title="New collection"
        crumbs={[{ label: "Collections", href: "/admin/collections" }, { label: "New collection" }]}
      />
      <CollectionForm
        values={{}}
        categories={categories.map((c) => ({ value: String(c._id), label: c.name }))}
      />
    </>
  )
})
