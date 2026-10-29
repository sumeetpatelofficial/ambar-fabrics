"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { isValidSlug } from "@/lib/slug"
import { safeStorage } from "./safe-storage"

export const WISHLIST_LIMIT = 200

/** Stored data is untrusted (anyone can edit localStorage): keep only valid, unique slugs, capped. */
export function sanitizeWishlist(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  for (const item of value) {
    if (typeof item === "string" && isValidSlug(item)) seen.add(item)
    if (seen.size >= WISHLIST_LIMIT) break
  }
  return [...seen]
}

type WishlistState = {
  slugs: string[]
  /**
   * Whose list this is: the signed-in account's id once it has been merged with the account, otherwise null
   * (a guest's list). If the browser is later found signed out while still holding an account's list, that
   * list is cleared, so nothing is left behind for the next person on a shared device.
   */
  owner: string | null
  hydrated: boolean
  /**
   * For a signed-in person: whether this browser's list has been merged with the account's. Until then the
   * list on screen may be out of date, so changes wait. Not saved; it starts false on every page load.
   */
  synced: boolean
  setOwner: (owner: string | null) => void
  toggle: (slug: string) => boolean
  remove: (slug: string) => void
  clear: () => void
}

/**
 * Guest wishlist, saved in this browser. Signed-in accounts get a server-side wishlist in Phase 5,
 * which merges these slugs after login.
 */
export const useWishlist = create<WishlistState>()(
  persist(
    (set, get) => ({
      slugs: [],
      owner: null,
      hydrated: false,
      synced: false,
      setOwner: (owner) => set({ owner }),
      /** Returns the new state: true when the product is now on the wishlist. */
      toggle: (slug) => {
        const has = get().slugs.includes(slug)
        if (!has && get().slugs.length >= WISHLIST_LIMIT) return false
        set({ slugs: has ? get().slugs.filter((s) => s !== slug) : [slug, ...get().slugs] })
        return !has
      },
      remove: (slug) => set({ slugs: get().slugs.filter((s) => s !== slug) }),
      clear: () => set({ slugs: [], owner: null }),
    }),
    {
      name: "af-wishlist",
      version: 1,
      storage: safeStorage,
      skipHydration: true, // rehydrated after mount so server and first client render match
      partialize: (state) => ({ slugs: state.slugs, owner: state.owner }),
      merge: (persisted, current) => {
        const stored = persisted as { slugs?: unknown; owner?: unknown } | undefined
        return {
          ...current,
          slugs: sanitizeWishlist(stored?.slugs),
          owner:
            typeof stored?.owner === "string" && /^[0-9a-f]{24}$/.test(stored.owner)
              ? stored.owner
              : null,
        }
      },
      onRehydrateStorage: () => () => useWishlist.setState({ hydrated: true }),
    }
  )
)
