"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { safeStorage } from "./safe-storage"

export const BAG_LINE_LIMIT = 50
const OBJECT_ID = /^[0-9a-f]{24}$/

export type BagLine = { variantId: string; qty: number }

/** Stored data is untrusted: only well-formed lines survive, merged by variant and capped. */
export function sanitizeBag(value: unknown): BagLine[] {
  if (!Array.isArray(value)) return []
  const byVariant = new Map<string, number>()
  for (const line of value) {
    if (typeof line !== "object" || line === null) continue
    const { variantId, qty } = line as Record<string, unknown>
    if (typeof variantId !== "string" || !OBJECT_ID.test(variantId)) continue
    if (typeof qty !== "number" || !Number.isSafeInteger(qty) || qty <= 0) continue
    byVariant.set(variantId, (byVariant.get(variantId) ?? 0) + qty)
    if (byVariant.size >= BAG_LINE_LIMIT) break
  }
  return [...byVariant].map(([variantId, qty]) => ({ variantId, qty }))
}

type BagState = {
  lines: BagLine[]
  hydrated: boolean
  /** Counts local changes, so a slow answer from the server cannot overwrite something done since it was asked. */
  rev: number
  /** Whose bag this is: the account id once merged with the account's saved bag, otherwise null (a guest). */
  owner: string | null
  /**
   * One-time id for folding this guest bag into an account. If the request is repeated (the page changed
   * before the answer arrived) the server applies it once. Cleared whenever the guest bag changes.
   */
  mergeId: string | null
  /** Signed in only: whether this browser's bag has been merged with the account's yet. */
  synced: boolean
  /** Replaces the lines with what the server holds (the saved bag is the truth for a signed-in person). */
  replace: (lines: BagLine[]) => void
  /** Quantity (in the variant's base unit) already in the bag. */
  qtyOf: (variantId: string) => number
  add: (variantId: string, qty: number) => void
  /** Sets an exact quantity (guest bag). */
  setQty: (variantId: string, qty: number) => void
  remove: (variantId: string) => void
  clear: () => void
}

/**
 * The bag as this browser knows it: variant ids and quantities in base units, never prices. A guest's bag
 * lives only here. For a signed-in person the saved bag on the server is the truth and this mirrors it
 * (see AuthSync). Prices, stock and limits are always computed by the server (cart service).
 */
export const useBag = create<BagState>()(
  persist(
    (set, get) => ({
      lines: [],
      hydrated: false,
      rev: 0,
      owner: null,
      mergeId: null,
      synced: false,
      replace: (lines) => set({ lines: sanitizeBag(lines), rev: get().rev + 1 }),
      qtyOf: (variantId) => get().lines.find((l) => l.variantId === variantId)?.qty ?? 0,
      add: (variantId, qty) => {
        if (!OBJECT_ID.test(variantId) || !Number.isSafeInteger(qty) || qty <= 0) return
        const lines = get().lines
        const existing = lines.find((l) => l.variantId === variantId)
        if (!existing && lines.length >= BAG_LINE_LIMIT) return
        set({
          rev: get().rev + 1,
          mergeId: null,
          lines: existing
            ? lines.map((l) => (l.variantId === variantId ? { ...l, qty: l.qty + qty } : l))
            : [...lines, { variantId, qty }],
        })
      },
      setQty: (variantId, qty) => {
        if (!Number.isSafeInteger(qty) || qty <= 0) return
        set({
          rev: get().rev + 1,
          mergeId: null,
          lines: get().lines.map((l) => (l.variantId === variantId ? { ...l, qty } : l)),
        })
      },
      remove: (variantId) =>
        set({
          rev: get().rev + 1,
          mergeId: null,
          lines: get().lines.filter((l) => l.variantId !== variantId),
        }),
      clear: () => set({ lines: [], owner: null, mergeId: null, rev: get().rev + 1 }),
    }),
    {
      name: "af-bag",
      version: 1,
      storage: safeStorage,
      skipHydration: true,
      partialize: (state) => ({ lines: state.lines, owner: state.owner, mergeId: state.mergeId }),
      merge: (persisted, current) => {
        const stored = persisted as
          { lines?: unknown; owner?: unknown; mergeId?: unknown } | undefined
        return {
          ...current,
          lines: sanitizeBag(stored?.lines),
          owner:
            typeof stored?.owner === "string" && OBJECT_ID.test(stored.owner) ? stored.owner : null,
          mergeId:
            typeof stored?.mergeId === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(stored.mergeId)
              ? stored.mergeId
              : null,
        }
      },
      onRehydrateStorage: () => () => useBag.setState({ hydrated: true }),
    }
  )
)
