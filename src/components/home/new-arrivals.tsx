import Link from "next/link"
import { connection } from "next/server"
import type { home } from "@/content/home"
import { productListQuerySchema } from "@/features/catalog/schemas"
import { cachedListProducts } from "@/services/catalog-cache"
import { Reveal } from "@/components/home/reveal"
import { RevealGrid } from "@/components/home/reveal-grid"
import { ProductGrid } from "@/components/storefront/product-grid"

/** The four newest products, from the real catalogue, as the shop's own product cards in 4:5 pictures. */
export async function NewArrivals({ copy }: { copy: typeof home.newArrivals }) {
  await connection() // read per request, never baked into the build
  const result = await cachedListProducts(
    productListQuerySchema.parse({ pageSize: 4, flag: "newArrival", sort: "newest" })
  )
  if (!result || result.items.length === 0) return null
  return (
    <section aria-labelledby="new-arrivals" className="py-[120px]">
      <div className="home-container">
        <Reveal className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 id="new-arrivals" className="text-[clamp(2.5rem,4.6vw,4rem)] leading-none">
            {copy.title}
          </h2>
          <Link href={copy.href} className="text-sm font-semibold underline underline-offset-[6px]">
            {copy.linkLabel}
          </Link>
        </Reveal>
        <div className="mt-11">
          <RevealGrid>
            <ProductGrid items={result.items} ratio="portrait" listName="/ (new arrivals)" />
          </RevealGrid>
        </div>
      </div>
    </section>
  )
}
