import { ContentPageView } from "@/components/content/content-page"
import { pageMetadata } from "@/components/content/page-metadata"

export const generateMetadata = () => pageMetadata("return-refund-policy")

export default function Page() {
  return <ContentPageView slug="return-refund-policy" />
}
