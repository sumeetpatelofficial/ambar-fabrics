import Link from "next/link"
import { notFound } from "next/navigation"
import { PageTitle, staffPage } from "@/components/admin/staff-page"
import { ProductForm, VariantForm } from "@/components/admin/product-forms"
import { emptyVariantForm, productToForm, variantToForm } from "@/features/admin/mappers"
import { roleHasPermission } from "@/config/permissions"
import { NotFoundError } from "@/lib/errors"
import { formatQuantity } from "@/lib/measure"
import { getProductAdmin, listCategoriesAdmin } from "@/services/admin-catalog-service"
import { listTaxa } from "@/services/admin-taxonomy-service"

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }

export default staffPage<Props>("catalog:read", async ({ actor, props }) => {
  const { id } = await props.params
  const { created } = await props.searchParams
  let data
  try {
    data = await getProductAdmin(actor, id)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }
  const categories = await listCategoriesAdmin(actor)
  const [fabrics, prints] = await Promise.all([listTaxa(actor, "fabric"), listTaxa(actor, "print")])
  const usable = (list: typeof fabrics, current?: string) =>
    list
      .filter((t) => t.status === "active" || t.id === current)
      .map((t) => ({ value: t.id, label: t.status === "hidden" ? `${t.name} (hidden)` : t.name }))
  const { product, variants } = data
  const canSeeCost = roleHasPermission(actor.role, "costs:read")
  return (
    <div className="flex flex-col gap-10">
      <div>
        <PageTitle
          title={product.name}
          crumbs={[{ label: "Products", href: "/admin/products" }, { label: product.name }]}
        />
        {created ? (
          <p role="status" className="border border-primary/40 bg-primary/5 p-3 text-sm">
            Product created. Add at least one variant (a colour or size with a price) so customers
            can buy it.
          </p>
        ) : null}
        {product.status === "active" ? (
          <p className="mt-2 text-sm">
            <Link href={`/products/${product.slug}`} className="underline underline-offset-4">
              View in the shop
            </Link>
          </p>
        ) : null}
      </div>
      <ProductForm
        productId={String(product._id)}
        values={productToForm(product)}
        categories={categories.map((c) => ({ value: String(c._id), label: c.name }))}
        fabrics={usable(fabrics, product.fabricId ? String(product.fabricId) : undefined)}
        prints={usable(prints, product.printId ? String(product.printId) : undefined)}
      />
      <section aria-labelledby="variants" className="flex flex-col gap-4">
        <h2 id="variants" className="text-2xl">
          Variants
        </h2>
        {variants.map((v) => (
          <details key={String(v._id)} className="border p-4">
            <summary className="cursor-pointer">
              {v.sku}
              <span className="text-sm text-muted-foreground">
                {" "}
                {[v.options?.colorName, v.options?.size].filter(Boolean).join(", ")}, {v.status},{" "}
                {formatQuantity(v.sellingUnit, v.stock.onHand)} on hand
              </span>
            </summary>
            <div className="mt-4">
              <VariantForm
                productId={String(product._id)}
                values={variantToForm(v, canSeeCost)}
                showCost={canSeeCost}
              />
            </div>
          </details>
        ))}
        <details className="border p-4" open>
          <summary className="cursor-pointer">Add a variant</summary>
          <div className="mt-4">
            <VariantForm productId={String(product._id)} values={emptyVariantForm} isNew />
          </div>
        </details>
      </section>
    </div>
  )
})
