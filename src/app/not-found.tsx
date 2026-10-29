import { SiteChrome } from "@/components/layout/site-chrome"
import { NotFoundContent } from "@/components/layout/not-found-content"

/** For addresses that match no page at all, and for hidden areas such as the admin for people who may not see it. */
export default function NotFound() {
  return (
    <SiteChrome>
      <NotFoundContent />
    </SiteChrome>
  )
}
