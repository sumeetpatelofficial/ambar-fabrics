"use client"

import { useState } from "react"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { events } from "@/lib/analytics/events"
import { track } from "@/lib/analytics/track"
import { WishlistButton } from "@/components/storefront/wishlist-button"
import { setWishlistItemAction } from "@/features/account/actions"
import { useWishlist } from "@/stores/wishlist-store"

/**
 * A WishlistButton wired to the wishlist. For a guest it changes the list in this browser at once. When
 * signed in it saves to the account first and changes the screen only after the server confirms, so what
 * is shown is never ahead of what is saved (and a quick navigation cannot lose the change).
 */
export function WishlistToggle({
  slug,
  productName,
  pricePaise = 0,
  className,
}: {
  slug: string
  productName: string
  /** Reported with the "added to wishlist" analytics event. */
  pricePaise?: number
  className?: string
}) {
  const pressed = useWishlist((s) => s.hydrated && s.slugs.includes(slug))
  const toggle = useWishlist((s) => s.toggle)
  const { status } = useSession()
  const synced = useWishlist((s) => s.synced)
  const [saving, setSaving] = useState(false)
  // A signed-in person's list is only trustworthy once it has merged with the account's.
  const waiting = status === "loading" || (status === "authenticated" && !synced)

  return (
    <WishlistButton
      productName={productName}
      pressed={pressed}
      disabled={saving || waiting}
      className={className}
      onPressedChange={async (next) => {
        if (status === "authenticated") {
          setSaving(true)
          const saved = await setWishlistItemAction(slug, next)
          setSaving(false)
          if (!saved) {
            toast.error("We could not save that to your account", {
              description: "Please try again.",
            })
            return
          }
        }
        const added = toggle(slug)
        if (added) track(events.addToWishlist({ slug, name: productName, pricePaise }))
        toast(added ? "Saved to your wishlist" : "Removed from your wishlist", {
          description: productName,
        })
      }}
    />
  )
}
