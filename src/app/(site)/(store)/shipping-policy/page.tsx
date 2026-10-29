import { ContentPageView } from "@/components/content/content-page"
import { pageMetadata } from "@/components/content/page-metadata"

export const generateMetadata = () => pageMetadata("shipping-policy")

export default function Page() {
  return <ContentPageView slug="shipping-policy" />
}
