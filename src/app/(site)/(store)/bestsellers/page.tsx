import type { Metadata } from "next"
import { Suspense } from "react"
import { Container } from "@/components/layout/container"
import { ListingSkeleton } from "@/components/storefront/listing/listing-skeleton"
import { ListingView } from "@/components/storefront/listing/listing-view"
import { listingMetadata } from "@/features/catalog/listing-metadata"

const description = "The fabrics and clothing our customers buy most."

export function generateMetadata({ searchParams }: PageProps<"/bestsellers">): Promise<Metadata> {
  return listingMetadata({
    title: "Bestsellers",
    description,
    basePath: "/bestsellers",
    searchParams,
    defaultSort: "popular",
    constraint: { flag: "bestseller" },
  })
}

const header = {
  title: "Bestsellers",
  description,
  breadcrumbs: [{ label: "Home", href: "/" }, { label: "Bestsellers" }],
}

export default function BestsellersPage({ searchParams }: PageProps<"/bestsellers">) {
  return (
    <Container>
      <Suspense fallback={<ListingSkeleton header={header} />}>
        <ListingView
          header={header}
          searchParams={searchParams}
          basePath="/bestsellers"
          constraint={{ flag: "bestseller" }}
          defaultSort="popular"
          sortOptions={["popular", "newest", "price_asc", "price_desc"]}
          emptyTitle="No bestsellers yet"
          emptyDescription="Bestsellers appear here once orders come in. Browse everything in the meantime."
        />
      </Suspense>
    </Container>
  )
}
