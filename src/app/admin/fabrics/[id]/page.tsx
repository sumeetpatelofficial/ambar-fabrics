import { notFound } from "next/navigation"
import { PageTitle, staffPage } from "@/components/admin/staff-page"
import { TaxonForm } from "@/components/admin/taxon-form"
import { NotFoundError } from "@/lib/errors"
import { getTaxon } from "@/services/admin-taxonomy-service"

export default staffPage<{ params: Promise<{ id: string }> }>(
  "catalog:write",
  async ({ actor, props }) => {
    const { id } = await props.params
    let taxon
    try {
      taxon = await getTaxon(actor, id)
    } catch (error) {
      if (error instanceof NotFoundError) notFound()
      throw error
    }
    if (taxon.kind !== "fabric") notFound()
    return (
      <>
        <PageTitle
          title={taxon.name}
          crumbs={[{ label: "Fabrics", href: "/admin/fabrics" }, { label: taxon.name }]}
        />
        <TaxonForm
          kind="fabric"
          values={{
            id,
            name: taxon.name,
            slug: taxon.slug,
            description: taxon.description ?? "",
            status: taxon.status,
          }}
        />
      </>
    )
  }
)
