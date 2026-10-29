import type { Metadata } from "next"
import { Suspense } from "react"
import { Container } from "@/components/layout/container"
import { ListingSkeleton } from "@/components/storefront/listing/listing-skeleton"
import { ListingView } from "@/components/storefront/listing/listing-view"
import { listingMetadata } from "@/features/catalog/listing-metadata"

const description = "The newest fabrics, dupattas and clothing, added most recently."

export function generateMetadata({ searchParams }: PageProps<"/new-arrivals">): Promise<Metadata> {
  return listingMetadata({
    title: "New arrivals",
    description,
    basePath: "/new-arrivals",
    searchParams,
    defaultSort: "newest",
    constraint: { flag: "newArrival" },
  })
}

const header = {
  title: "New arrivals",
  description,
  breadcrumbs: [{ label: "Home", href: "/" }, { label: "New arrivals" }],
}

export default function NewArrivalsPage({ searchParams }: PageProps<"/new-arrivals">) {
  return (
    <Container>
      <Suspense fallback={<ListingSkeleton header={header} />}>
        <ListingView
          header={header}
          searchParams={searchParams}
          basePath="/new-arrivals"
          constraint={{ flag: "newArrival" }}
          defaultSort="newest"
          emptyTitle="Nothing new right now"
          emptyDescription="New pieces are added often. Browse everything in the meantime."
        />
      </Suspense>
    </Container>
  )
}
