import Link from "next/link"
import { PageTitle, staffPage } from "@/components/admin/staff-page"
import { buttonVariants } from "@/components/ui/button"
import { roleHasPermission } from "@/config/permissions"
import { listCollectionsAdmin } from "@/services/admin-catalog-service"

export default staffPage<{ searchParams: Promise<{ saved?: string }> }>(
  "catalog:read",
  async ({ actor, props }) => {
    const { saved } = await props.searchParams
    const collections = await listCollectionsAdmin(actor)
    return (
      <>
        <PageTitle title="Collections" crumbs={[{ label: "Collections" }]}>
          {roleHasPermission(actor.role, "catalog:write") ? (
            <Link href="/admin/collections/new" className={buttonVariants()}>
              New collection
            </Link>
          ) : null}
        </PageTitle>
        {saved ? (
          <p role="status" className="mb-4 border border-primary/40 bg-primary/5 p-3 text-sm">
            Saved.
          </p>
        ) : null}
        <ul className="divide-y border-y">
          {collections.map((c) => (
            <li key={String(c._id)} className="py-3">
              <Link
                href={`/admin/collections/${c._id}`}
                className="text-lg underline-offset-4 hover:underline"
              >
                {c.name}
              </Link>
              <p className="text-sm text-muted-foreground">
                {c.type === "manual"
                  ? `${c.productIds.length} products picked by hand`
                  : "Chosen by a rule"}
                {c.status === "hidden" ? ", hidden" : ""}
              </p>
            </li>
          ))}
        </ul>
      </>
    )
  }
)
