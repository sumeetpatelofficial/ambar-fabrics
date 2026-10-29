import { notFound } from "next/navigation"
import { PageTitle, staffPage } from "@/components/admin/staff-page"
import { CollectionForm } from "@/components/admin/other-forms"
import { collectionToForm } from "@/features/admin/mappers"
import { NotFoundError } from "@/lib/errors"
import { getCollectionAdmin, listCategoriesAdmin } from "@/services/admin-catalog-service"

export default staffPage<{ params: Promise<{ id: string }> }>(
  "catalog:write",
  async ({ actor, props }) => {
    const { id } = await props.params
    try {
      const collection = await getCollectionAdmin(actor, id)
      const categories = await listCategoriesAdmin(actor)
      return (
        <>
          <PageTitle
            title={collection.name}
            crumbs={[
              { label: "Collections", href: "/admin/collections" },
              { label: collection.name },
            ]}
          />
          <CollectionForm
            values={collectionToForm(collection)}
            categories={categories.map((c) => ({ value: String(c._id), label: c.name }))}
          />
        </>
      )
    } catch (error) {
      if (error instanceof NotFoundError) notFound()
      throw error
    }
  }
)
