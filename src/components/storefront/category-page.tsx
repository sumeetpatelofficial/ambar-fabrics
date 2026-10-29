import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { Container } from "@/components/layout/container"
import { ListingSkeleton } from "@/components/storefront/listing/listing-skeleton"
import { ListingView } from "@/components/storefront/listing/listing-view"
import { listingMetadata } from "@/features/catalog/listing-metadata"
import { breadcrumbLinks, categoryHref } from "@/lib/category-url"
import { breadcrumbJsonLd, JsonLd } from "@/lib/seo/jsonld"
import { truncateDescription } from "@/lib/seo/metadata"
import { cachedCategory } from "@/services/catalog-cache"

type Raw = Record<string, string | string[] | undefined>

/** Shared by `/categories/[slug]` and `/categories/[parent]/[slug]`. The proxy has already checked the address is the right one. */
export async function categoryMetadata(
  slug: string,
  searchParams: Promise<Raw>
): Promise<Metadata> {
  const category = await cachedCategory(slug)
  if (!category) return { title: "Category not found", robots: { index: false } }
  return listingMetadata({
    title: category.seo?.title ?? category.name,
    description:
      category.seo?.description ??
      truncateDescription(
        category.description ?? `Shop ${category.name}: fabrics, dupattas and clothing.`
      ),
    basePath: categoryHref(slug, category.parentSlug),
    searchParams,
    constraint: { category: slug },
    noindex: category.seo?.noindex,
  })
}

async function CategoryContent({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; child?: string }>
  searchParams: Promise<Raw>
}) {
  // `/categories/[slug]/[child]`: the first segment is the parent, the last one is the category shown.
  const { slug: first, child } = await params
  const slug = child ?? first
  // The proxy answers unknown slugs with a real 404 first. This guards the narrow race after an unpublish.
  const category = await cachedCategory(slug)
  if (!category) notFound()

  const trail = breadcrumbLinks(category.breadcrumbs)
  const crumbs = [
    { label: "Home", href: "/" },
    ...trail.slice(0, -1).map((b) => ({ label: b.name, href: b.href })),
    { label: category.name },
  ]
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          ...trail.map((b) => ({ name: b.name, path: b.href })),
        ])}
      />
      <ListingView
        header={{ title: category.name, description: category.description, breadcrumbs: crumbs }}
        searchParams={searchParams}
        basePath={categoryHref(slug, category.parentSlug)}
        constraint={{ category: slug }}
        emptyTitle={`No ${category.name.toLowerCase()} match those filters`}
        emptyDescription="Try removing a filter, or browse everything."
      />
    </>
  )
}

export function CategoryPageView({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; child?: string }>
  searchParams: Promise<Raw>
}) {
  return (
    <Container>
      <Suspense fallback={<ListingSkeleton />}>
        <CategoryContent params={params} searchParams={searchParams} />
      </Suspense>
    </Container>
  )
}
