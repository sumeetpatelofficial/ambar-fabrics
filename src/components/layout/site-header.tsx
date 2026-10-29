import { Suspense } from "react"
import Link from "next/link"
import { Heart } from "lucide-react"
import { cn } from "cn"
import { buttonVariants } from "@/components/ui/button"
import { AccountLink } from "@/components/layout/account-link"
import { BagLink } from "@/components/layout/bag-link"
import { MainMenu } from "@/components/layout/main-menu"
import { SearchOverlay } from "@/components/layout/search-overlay"
import { Wordmark } from "@/components/layout/wordmark"

/**
 * Sticky header on every screen size: the menu button on the left, the logo centred, and search, account,
 * wishlist and bag on the right. All links are in the menu.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-white py-2 print:hidden">
      <div className="mx-auto grid h-16 w-full max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-2 px-2 sm:px-6 lg:grid-cols-[1fr_auto_1fr] lg:gap-6">
        <div className="flex items-center">
          {/* The current page is only known per request, so the menu waits in its own boundary. */}
          <Suspense fallback={<span aria-hidden="true" className="size-11" />}>
            <MainMenu />
          </Suspense>
        </div>
        <Wordmark className="justify-self-center" />
        <div className="flex items-center justify-end">
          <SearchOverlay />
          <AccountLink className="max-sm:hidden" />
          <Link
            href="/account/wishlist"
            aria-label="Wishlist"
            className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "max-sm:hidden")}
          >
            <Heart aria-hidden="true" className="size-5" />
          </Link>
          <BagLink />
        </div>
      </div>
    </header>
  )
}
