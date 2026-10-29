import { ContentPageView } from "@/components/content/content-page"
import { pageMetadata } from "@/components/content/page-metadata"

export const generateMetadata = () => pageMetadata("about")

export default function Page() {
  return <ContentPageView slug="about" />
}
