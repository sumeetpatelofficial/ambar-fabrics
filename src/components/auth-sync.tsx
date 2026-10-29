"use client"

import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { useEffect, useRef } from "react"
import { toast } from "sonner"
import { syncWishlistAction } from "@/features/account/actions"
import { mergeCartAction } from "@/features/cart/actions"
import { useBag } from "@/stores/bag-store"
import { useWishlist } from "@/stores/wishlist-store"

/**
 * Keeps the guest wishlist and the account wishlist in step:
 *  - when someone signs in, products saved on this browser are merged into their account, and the
 *    combined list replaces the local one;
 *  - when the browser is found signed out while still holding an account's list, it is cleared, so the next
 *    person on a shared device does not see it.
 */
/** Pages where signing in or out happens, so moving to or from them may have changed who is signed in. */
const isAuthArea = (path: string) =>
  /^\/(login|register|verify-email|reset-password|account)(\/|$)/.test(path)

export function AuthSync() {
  const { status, update, data } = useSession()
  const userId = data?.user?.id
  const pathname = usePathname()
  const lastPath = useRef(pathname)
  const hydrated = useWishlist((s) => s.hydrated)
  const synced = useRef(false)
  const bagHydrated = useBag((s) => s.hydrated)
  const bagSynced = useRef(false)

  // Sign-in and sign-out are server actions that end in a soft navigation, which does not refresh Auth.js's
  // client-side copy of the session. Re-reading it when the route moves in or out of these areas keeps the
  // header and the wishlist in step without polling.
  useEffect(() => {
    const previous = lastPath.current
    lastPath.current = pathname
    if (previous !== pathname && (isAuthArea(previous) || isAuthArea(pathname))) void update()
  }, [pathname, update])

  useEffect(() => {
    if (!hydrated || status === "loading") return
    const { owner } = useWishlist.getState()

    if (status === "authenticated" && userId && !synced.current) {
      synced.current = true
      // Someone else's list (their session ended without this browser noticing): never merge it into this account.
      if (owner && owner !== userId) useWishlist.setState({ slugs: [], owner: null })
      void syncWishlistAction(useWishlist.getState().slugs).then((merged) => {
        // Even if the merge failed, stop waiting: the list on screen is then simply this browser's own.
        useWishlist.setState(
          merged ? { slugs: merged, owner: userId, synced: true } : { synced: true }
        )
      })
    }
    // Found signed out while this browser still holds an account's list (the person signed out, the session
    // expired, or it was ended from another device): clear it so the next person on this device does not see it.
    if (status === "unauthenticated") {
      synced.current = false
      if (owner) useWishlist.getState().clear()
      useWishlist.setState({ synced: false })
    }
  }, [status, hydrated, userId])

  // The bag follows the same rules: merged into the account's bag on sign-in, cleared when found signed out.
  useEffect(() => {
    if (!bagHydrated || status === "loading") return
    const { owner } = useBag.getState()

    if (status === "authenticated" && userId && !bagSynced.current) {
      bagSynced.current = true
      // A bag left by someone else is never merged into this account.
      if (owner && owner !== userId) useBag.setState({ lines: [], owner: null, mergeId: null })
      const state = useBag.getState()
      // This browser's copy of an account's own bag is only a mirror: sending it again would add it twice.
      const mirror = state.owner === userId
      const guestLines = mirror ? [] : state.lines
      // A guest bag is sent under a one-time id kept in storage until the answer arrives. If the page changes
      // before then and the request is sent again, the server applies it once. The items stay here meanwhile.
      const mergeId =
        mirror || guestLines.length === 0 ? undefined : (state.mergeId ?? crypto.randomUUID())
      if (mergeId && state.mergeId !== mergeId) useBag.setState({ mergeId })
      const startedAt = state.rev
      void mergeCartAction(guestLines, mergeId).then((result) => {
        if (result.ok) {
          // If the bag was changed while this was in flight, that change already holds the newer server state.
          const changed = useBag.getState().rev !== startedAt
          useBag.setState(
            changed
              ? { owner: userId, synced: true, mergeId: null }
              : { lines: result.lines, owner: userId, synced: true, mergeId: null }
          )
          for (const notice of result.notices ?? []) toast.info(notice)
        } else {
          // Not merged: the guest's items are still here, so nothing is lost. Try again next time.
          useBag.setState({ synced: true })
          bagSynced.current = false
        }
      })
    }
    if (status === "unauthenticated") {
      bagSynced.current = false
      // Not `clear()`: this is not a change by the person, so it must not make a pending answer look stale.
      if (owner) useBag.setState({ lines: [], owner: null })
      useBag.setState({ synced: false })
    }
  }, [status, bagHydrated, userId])

  return null
}
