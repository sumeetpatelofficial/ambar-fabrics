import type { Metadata } from "next"
import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { Container } from "@/components/layout/container"
import { PageHeader } from "@/components/layout/page-header"
import { CheckoutView } from "@/components/checkout/checkout-view"
import { siteDefaults } from "@/config/site"
import { requireUser, toActor } from "@/lib/auth/session"
import { listAddresses } from "@/services/account-service"

export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } }

async function Content() {
  const user = await requireUser("/checkout")
  const addresses = await listAddresses(toActor(user))
  return <CheckoutView addresses={addresses} siteName={siteDefaults.name} />
}

export default function CheckoutPage() {
  return (
    <Container>
      <PageHeader
        title="Checkout"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Bag", href: "/cart" },
          { label: "Checkout" },
        ]}
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Content />
      </Suspense>
    </Container>
  )
}
