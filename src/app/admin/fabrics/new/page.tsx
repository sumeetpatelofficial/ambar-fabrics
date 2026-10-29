import { PageTitle, staffPage } from "@/components/admin/staff-page"
import { TaxonForm } from "@/components/admin/taxon-form"

export default staffPage<object>("catalog:write", async () => (
  <>
    <PageTitle
      title="New fabric"
      crumbs={[{ label: "Fabrics", href: "/admin/fabrics" }, { label: "New fabric" }]}
    />
    <TaxonForm kind="fabric" values={{ status: "active" }} />
  </>
))
