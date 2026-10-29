import type { Metadata } from "next"
import { Suspense } from "react"
import { Container } from "@/components/layout/container"
import { ListingSkeleton } from "@/components/storefront/listing/listing-skeleton"
import { ListingView } from "@/components/storefront/listing/listing-view"
import { listingMetadata } from "@/features/catalog/listing-metadata"

const description =
  "Fabrics sold by the metre, dupattas, blouses, ready-made kurtis and dresses, and unstitched suits."

export function generateMetadata({ searchParams }: PageProps<"/shop">): Promise<Metadata> {
  return listingMetadata({ title: "Shop all", description, basePath: "/shop", searchParams })
}

const header = {
  title: "Shop all",
  description,
  breadcrumbs: [{ label: "Home", href: "/" }, { label: "Shop" }],
}

export default function ShopPage({ searchParams }: PageProps<"/shop">) {
  return (
    <Container>
      <Suspense fallback={<ListingSkeleton header={header} />}>
        <ListingView header={header} searchParams={searchParams} basePath="/shop" />
      </Suspense>
    </Container>
  )
}
