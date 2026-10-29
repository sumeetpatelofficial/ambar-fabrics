import type { Metadata } from "next"
import { Container } from "@/components/layout/container"
import { PageHeader } from "@/components/layout/page-header"
import { TrackForm } from "@/components/content/track-form"
import { buildMetadata } from "@/lib/seo/metadata"

export const metadata: Metadata = buildMetadata({
  title: "Track your order",
  description: "See where your order is with your order number and email.",
  path: "/track-order",
  noindex: true,
})

export default function TrackOrderPage() {
  return (
    <Container>
      <PageHeader
        title="Track your order"
        description="Enter the order number from your confirmation email and the email address you used."
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Track your order" }]}
      />
      <TrackForm />
    </Container>
  )
}
