import { ContentPageView } from "@/components/content/content-page"
import { pageMetadata } from "@/components/content/page-metadata"

export const generateMetadata = () => pageMetadata("terms-and-conditions")

export default function Page() {
  return <ContentPageView slug="terms-and-conditions" />
}
