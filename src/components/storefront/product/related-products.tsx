import { ProductGrid } from "@/components/storefront/product-grid"
import { cachedRelatedProducts } from "@/services/catalog-cache"

/** "You may also like": same-category products. Renders nothing when there are none. */
export async function RelatedProducts({ slug }: { slug: string }) {
  const items = await cachedRelatedProducts(slug)
  if (!items || items.length === 0) return null
  return (
    <section aria-labelledby="related" className="mt-20 flex flex-col gap-6 border-t pt-10">
      <h2 id="related" className="text-3xl">
        You may also like
      </h2>
      <ProductGrid items={items.slice(0, 4)} />
    </section>
  )
}
