import type { Metadata } from "next"
import { Suspense } from "react"
import { Container } from "@/components/layout/container"
import { ListingSkeleton } from "@/components/storefront/listing/listing-skeleton"
import { ListingView } from "@/components/storefront/listing/listing-view"
import { listingMetadata } from "@/features/catalog/listing-metadata"

const description = "Fabrics and clothing at reduced prices, for as long as the offer runs."

export function generateMetadata({ searchParams }: PageProps<"/sale">): Promise<Metadata> {
  return listingMetadata({
    title: "Sale",
    description,
    basePath: "/sale",
    searchParams,
    constraint: { onSale: true },
  })
}

const header = {
  title: "Sale",
  description,
  breadcrumbs: [{ label: "Home", href: "/" }, { label: "Sale" }],
}

export default function SalePage({ searchParams }: PageProps<"/sale">) {
  return (
    <Container>
      <Suspense fallback={<ListingSkeleton header={header} />}>
        <ListingView
          header={header}
          searchParams={searchParams}
          basePath="/sale"
          constraint={{ onSale: true }}
          emptyTitle="No sale items right now"
          emptyDescription="Offers come and go. Browse everything in the meantime."
        />
      </Suspense>
    </Container>
  )
}
