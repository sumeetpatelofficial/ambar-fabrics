import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { Container } from "@/components/layout/container"
import { ListingSkeleton } from "@/components/storefront/listing/listing-skeleton"
import { ListingView } from "@/components/storefront/listing/listing-view"
import { breadcrumbJsonLd, JsonLd } from "@/lib/seo/jsonld"
import { listingMetadata } from "@/features/catalog/listing-metadata"
import { truncateDescription } from "@/lib/seo/metadata"
import { cachedCollection } from "@/services/catalog-cache"

export async function generateMetadata({
  params,
  searchParams,
}: PageProps<"/collections/[slug]">): Promise<Metadata> {
  const { slug } = await params
  const collection = await cachedCollection(slug)
  if (!collection) return { title: "Collection not found", robots: { index: false } }
  return listingMetadata({
    title: collection.seo?.title ?? collection.name,
    description:
      collection.seo?.description ??
      truncateDescription(collection.description ?? `Shop the ${collection.name} collection.`),
    basePath: `/collections/${slug}`,
    searchParams,
    constraint: { collection: slug },
    noindex: collection.seo?.noindex,
  })
}

async function CollectionContent({
  params,
  searchParams,
}: Pick<PageProps<"/collections/[slug]">, "params" | "searchParams">) {
  const { slug } = await params
  const collection = await cachedCollection(slug)
  if (!collection) notFound()
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: collection.name, path: `/collections/${slug}` },
        ])}
      />
      <ListingView
        header={{
          title: collection.name,
          description: collection.description,
          breadcrumbs: [{ label: "Home", href: "/" }, { label: collection.name }],
        }}
        searchParams={searchParams}
        basePath={`/collections/${slug}`}
        constraint={{ collection: slug }}
        emptyTitle="Nothing in this collection yet"
        emptyDescription="Pieces are added as they arrive. Browse everything in the meantime."
      />
    </>
  )
}

export default function CollectionPage({ params, searchParams }: PageProps<"/collections/[slug]">) {
  return (
    <Container>
      <Suspense fallback={<ListingSkeleton />}>
        <CollectionContent params={params} searchParams={searchParams} />
      </Suspense>
    </Container>
  )
}
