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
    const rows = await listTaxa(actor, "print")
    const canEdit = roleHasPermission(actor.role, "catalog:write")
    return (
      <>
        <PageTitle title="Prints" crumbs={[{ label: "Prints" }]}>
          {canEdit ? (
            <Link href="/admin/prints/new" className={buttonVariants()}>
              <Plus aria-hidden="true" className="size-4" /> New print
            </Link>
          ) : null}
        </PageTitle>
        {saved ? (
          <p role="status" className="mb-4 border border-primary/40 bg-primary/5 p-3 text-sm">
            Saved.
          </p>
        ) : null}
        <p className="mb-4 max-w-2xl text-sm text-muted-foreground">
          Bandhani, Ajrakh, block print and other ways cloth is decorated. Any print can be on any
          fabric.
        </p>
        <TaxonList
          kind="print"
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
