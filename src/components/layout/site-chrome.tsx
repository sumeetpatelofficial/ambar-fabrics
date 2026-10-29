import type { ReactNode } from "react"
import { AnnouncementBar } from "@/components/layout/announcement-bar"
import { SiteFooter } from "@/components/layout/site-footer"
import { SiteHeader } from "@/components/layout/site-header"

/** The storefront frame: announcement bar, header, page, footer. The admin area does not use it. */
export function SiteChrome({ children }: { children: ReactNode }) {
  return (
    <>
      <AnnouncementBar />
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </>
  )
}
