import type { ReactNode } from "react"
import { SiteChrome } from "@/components/layout/site-chrome"

/**
 * The shop's pages put their titles and canonical links in the page head (`htmlLimitedBots` in next.config), and
 * those come from the database at request time, so a page's first paint waits for them. Next's development check
 * for an "instant" static shell reports that as an invariant error on every such page. It is a development
 * warning only: the pages render, and the production build passes. This tells the check that these pages may block.
 */
export const instant = false

export default function SiteLayout({ children }: { children: ReactNode }) {
  return <SiteChrome>{children}</SiteChrome>
}
