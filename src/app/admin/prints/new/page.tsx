import { PageTitle, staffPage } from "@/components/admin/staff-page"
import { TaxonForm } from "@/components/admin/taxon-form"

export default staffPage<object>("catalog:write", async () => (
  <>
    <PageTitle
      title="New print"
      crumbs={[{ label: "Prints", href: "/admin/prints" }, { label: "New print" }]}
    />
    <TaxonForm kind="print" values={{ status: "active" }} />
  </>
))
