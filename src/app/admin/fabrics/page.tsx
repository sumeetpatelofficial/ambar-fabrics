import Link from "next/link"
import { Plus } from "lucide-react"
import { PageTitle, staffPage } from "@/components/admin/staff-page"
import { TaxonList } from "@/components/admin/taxon-list"
import { buttonVariants } from "@/components/ui/button"
import { roleHasPermission } from "@/config/permissions"
import { listTaxa } from "@/services/admin-taxonomy-service"

export default staffPage<{ searchParams: Promise<{ saved?: string }> }>(
  "catalog:read",
  async ({ actor, props }) => {
    const { saved } = await props.searchParams
    const rows = await listTaxa(actor, "fabric")
    const canEdit = roleHasPermission(actor.role, "catalog:write")
    return (
      <>
        <PageTitle title="Fabrics" crumbs={[{ label: "Fabrics" }]}>
          {canEdit ? (
            <Link href="/admin/fabrics/new" className={buttonVariants()}>
              <Plus aria-hidden="true" className="size-4" /> New fabric
            </Link>
          ) : null}
        </PageTitle>
        {saved ? (
          <p role="status" className="mb-4 border border-primary/40 bg-primary/5 p-3 text-sm">
            Saved.
          </p>
        ) : null}
        <p className="mb-4 max-w-2xl text-sm text-muted-foreground">
          The cloths you sell. Each one can be used by any product: a cotton fabric, a cotton
          dupatta, a cotton blouse all use the same Cotton.
        </p>
        <TaxonList
          kind="fabric"
          canEdit={canEdit}
          initial={rows.map((r) => ({
            id: r.id,
            name: r.name,
            products: r.products,
            hidden: r.status === "hidden",
          }))}
        />
      </>
    )
  }
)
