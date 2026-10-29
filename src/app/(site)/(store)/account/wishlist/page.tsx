import type { Metadata } from "next"
import { Container } from "@/components/layout/container"
import { PageHeader } from "@/components/layout/page-header"
import { WishlistView } from "@/components/storefront/wishlist-view"

export const metadata: Metadata = {
  title: "Your wishlist",
  robots: { index: false, follow: false },
}

export default function WishlistPage() {
  return (
    <Container>
      <PageHeader
        title="Your wishlist"
        description="Saved in this browser. Sign in and it is kept with your account on every device."
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Wishlist" }]}
      />
      <WishlistView />
    </Container>
  )
}
