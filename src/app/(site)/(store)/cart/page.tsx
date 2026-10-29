import type { Metadata } from "next"
import { Container } from "@/components/layout/container"
import { PageHeader } from "@/components/layout/page-header"
import { CartView } from "@/components/cart/cart-view"

export const metadata: Metadata = {
  title: "Your bag",
  robots: { index: false, follow: false },
}

export default function CartPage() {
  return (
    <Container>
      <PageHeader title="Your bag" breadcrumbs={[{ label: "Home", href: "/" }, { label: "Bag" }]} />
      <CartView />
    </Container>
  )
}
