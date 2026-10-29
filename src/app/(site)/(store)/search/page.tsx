import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { Search } from "lucide-react"
import { Container } from "@/components/layout/container"
import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/storefront/empty-state"
import { ListingSkeleton } from "@/components/storefront/listing/listing-skeleton"
import { ListingView } from "@/components/storefront/listing/listing-view"
import { parseListingParams } from "@/features/catalog/listing"
import { listingMetadata } from "@/features/catalog/listing-metadata"

export function generateMetadata({ searchParams }: PageProps<"/search">): Promise<Metadata> {
  // Search results are never indexed: they are endless, thin variations of the real category pages.
  return listingMetadata({ title: "Search", basePath: "/search", searchParams, noindex: true })
}

async function SearchContent({ searchParams }: Pick<PageProps<"/search">, "searchParams">) {
  const { q } = parseListingParams(await searchParams)
  const crumbs = [{ label: "Home", href: "/" }, { label: "Search" }]

  if (!q) {
    return (
      <>
        <PageHeader title="Search" breadcrumbs={crumbs} />
        <EmptyState
          icon={Search}
          title="What are you looking for?"
          description="Search by fabric, craft or colour, for example cotton, bandhani or sage."
          action={
            <Link href="/shop" className="underline underline-offset-4">
              Or browse everything
            </Link>
          }
        />
      </>
    )
  }

  return (
    <>
      <ListingView
        header={{ title: `Results for “${q}”`, breadcrumbs: crumbs }}
        searchParams={searchParams}
        basePath="/search"
        relevanceLabel="Best match"
        trackSearch={q}
        emptyTitle={`Nothing matched “${q}”`}
        emptyDescription="Check the spelling, or try a broader word such as cotton, dupatta or kurti."
      />
    </>
  )
}

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <Container>
      <Suspense fallback={<ListingSkeleton />}>
        <SearchContent searchParams={searchParams} />
      </Suspense>
    </Container>
  )
}
