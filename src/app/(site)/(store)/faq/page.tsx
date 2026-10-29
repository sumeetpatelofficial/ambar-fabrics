import { ContentPageView } from "@/components/content/content-page"
import { pageMetadata } from "@/components/content/page-metadata"

export const generateMetadata = () => pageMetadata("faq")

export default function Page() {
  return <ContentPageView slug="faq" />
}
