import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { Container } from "@/components/layout/container"
import { TrackViewItem } from "@/components/analytics/track-events"
import { breadcrumbLinks } from "@/lib/category-url"
import { Breadcrumbs } from "@/components/storefront/breadcrumbs"
import { ProductDetails } from "@/components/storefront/product/product-details"
import { ProductGallery } from "@/components/storefront/product/product-gallery"
import { ProductSkeleton } from "@/components/storefront/product/product-skeleton"
import { PurchasePanel } from "@/components/storefront/product/purchase-panel"
import { ReviewsSection } from "@/components/storefront/reviews/reviews-section"
import { RelatedProducts } from "@/components/storefront/product/related-products"
import { breadcrumbJsonLd, JsonLd, productJsonLd } from "@/lib/seo/jsonld"
import { buildMetadata, truncateDescription } from "@/lib/seo/metadata"
import { cachedProductDetail } from "@/services/catalog-cache"

export async function generateMetadata({
  params,
}: PageProps<"/products/[slug]">): Promise<Metadata> {
  const { slug } = await params
  const product = await cachedProductDetail(slug)
  if (!product) return { title: "Product not found", robots: { index: false } }
  const image = product.images[0]
  return buildMetadata({
    title: product.seo?.title ?? product.name,
    description:
      product.seo?.description ??
      truncateDescription(
        product.shortDescription ?? product.description ?? `${product.name} from Ambar.`
      ),
    path: `/products/${slug}`,
    image: image
      ? { url: image.url, alt: image.alt, width: image.width, height: image.height }
      : undefined,
    noindex: product.seo?.noindex,
  })
}

async function ProductContent({ params }: Pick<PageProps<"/products/[slug]">, "params">) {
  const { slug } = await params
  // The proxy answers unknown slugs with a real 404 first. This guards the narrow race after an unpublish.
  const product = await cachedProductDetail(slug)
  if (!product) notFound()

  const trail = breadcrumbLinks(product.breadcrumbs).map((b) => ({ name: b.name, path: b.href }))
  return (
    <>
      <TrackViewItem product={product} category={product.breadcrumbs.at(-1)?.name} />
      <JsonLd data={productJsonLd(product)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          ...trail,
          { name: product.name, path: `/products/${slug}` },
        ])}
      />
      <div className="flex flex-col gap-8">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            ...breadcrumbLinks(product.breadcrumbs).map((b) => ({ label: b.name, href: b.href })),
            { label: product.name },
          ]}
        />
        <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <ProductGallery images={product.images} product={product} />
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-3">
              <h1 className="text-4xl leading-tight sm:text-5xl">{product.name}</h1>
              {product.shortDescription ? (
                <p className="max-w-prose text-pretty text-muted-foreground">
                  {product.shortDescription}
                </p>
              ) : null}
            </div>
            <PurchasePanel product={product} />
            <ProductDetails product={product} />
          </div>
        </div>
      </div>
      <div className="mt-12">
        <Suspense fallback={null}>
          <ReviewsSection slug={slug} />
        </Suspense>
      </div>
      <Suspense fallback={null}>
        <RelatedProducts slug={slug} />
      </Suspense>
    </>
  )
}

export default function ProductPage({ params }: PageProps<"/products/[slug]">) {
  return (
    <Container>
      <Suspense fallback={<ProductSkeleton />}>
        <ProductContent params={params} />
      </Suspense>
    </Container>
  )
}
