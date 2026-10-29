"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { signOutAction } from "@/features/auth/actions"
import { useBag } from "@/stores/bag-store"
import { useWishlist } from "@/stores/wishlist-store"

const items = [
  { href: "/account", label: "Overview" },
  { href: "/account/orders", label: "Orders" },
  { href: "/account/wishlist", label: "Wishlist" },
  { href: "/account/addresses", label: "Addresses" },
  { href: "/account/profile", label: "Profile" },
  { href: "/account/security", label: "Sign-in and security" },
]

/** Section links for the account area. A row of links on phones, a column on larger screens. */
export function AccountNav() {
  const pathname = usePathname()
  return (
    <nav aria-label="Account" className="flex flex-col gap-4">
      <ul className="flex flex-wrap gap-x-1 gap-y-1 lg:flex-col">
        {items.map((item) => {
          const current =
            item.href === "/account" ? pathname === "/account" : pathname.startsWith(item.href)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center border-b-2 px-2 text-[0.95rem] transition-colors lg:w-full lg:border-b-0 lg:border-l-2 lg:px-3",
                  current
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
      {/* The saved list is cleared at once, not left for a later refresh, so a shared device keeps nothing. */}
      <form
        action={signOutAction}
        onSubmit={() => {
          useWishlist.getState().clear()
          useBag.getState().clear()
        }}
      >
        <Button type="submit" variant="outline">
          Sign out
        </Button>
      </form>
    </nav>
  )
}
