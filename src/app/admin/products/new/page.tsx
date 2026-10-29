import { PageTitle, staffPage } from "@/components/admin/staff-page"
import { ProductForm } from "@/components/admin/product-forms"
import { roleHasPermission } from "@/config/permissions"
import { listCategoriesAdmin } from "@/services/admin-catalog-service"
import { listTaxa } from "@/services/admin-taxonomy-service"

export default staffPage<object>("catalog:write", async ({ actor }) => {
  const categories = await listCategoriesAdmin(actor)
  const [fabrics, prints] = await Promise.all([listTaxa(actor, "fabric"), listTaxa(actor, "print")])
  return (
    <>
      <PageTitle
        title="New product"
        crumbs={[{ label: "Products", href: "/admin/products" }, { label: "New product" }]}
      />
      <ProductForm
        values={{ status: "draft", returnable: "on" }}
        fabrics={fabrics
          .filter((f) => f.status === "active")
          .map((f) => ({ value: f.id, label: f.name }))}
        prints={prints
          .filter((p) => p.status === "active")
          .map((p) => ({ value: p.id, label: p.name }))}
        showCost={roleHasPermission(actor.role, "costs:read")}
        categories={categories.map((c) => ({ value: String(c._id), label: c.name }))}
      />
    </>
  )
})
