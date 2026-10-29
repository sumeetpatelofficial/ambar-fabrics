"use client"

import Link from "next/link"
import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import { Heart } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/storefront/empty-state"
import { ProductGrid } from "@/components/storefront/product-grid"
import type { ProductCardDTO } from "@/features/catalog/types"
import { useWishlist } from "@/stores/wishlist-store"

type Result =
  { key: string; status: "error" } | { key: string; status: "ready"; items: ProductCardDTO[] }

/** Guest wishlist: loads the saved products from the catalogue API. Account wishlists arrive in Phase 5. */
export function WishlistView() {
  const hydrated = useWishlist((s) => s.hydrated)
  const synced = useWishlist((s) => s.synced)
  const { status } = useSession()
  const waiting = status === "loading" || (status === "authenticated" && !synced)
  const slugs = useWishlist((s) => s.slugs)
  const key = slugs.join(",")
  const [result, setResult] = useState<Result | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!hydrated || waiting || slugs.length === 0) return
    const controller = new AbortController()
    const params = new URLSearchParams({ pageSize: "60" })
    for (const slug of slugs) params.append("slugs", slug)
    fetch(`/api/v1/products?${params}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: { data: ProductCardDTO[] }) => {
        // Keep the order the visitor saved them in; products that are no longer sold simply drop out.
        const order = new Map(slugs.map((s, i) => [s, i]))
        const items = [...body.data].sort(
          (a, b) => (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0)
        )
        setResult({ key, status: "ready", items })
      })
      .catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === "AbortError"))
          setResult({ key, status: "error" })
      })
    return () => controller.abort()
    // `key` stands for the saved slugs; the array identity changes on every store update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, waiting, key, attempt])

  const empty = hydrated && slugs.length === 0
  const current = result?.key === key ? result : null // anything else is stale or not loaded yet
  const state = empty
    ? ({ status: "ready", items: [] as ProductCardDTO[] } as const)
    : current
      ? current
      : ({ status: "loading" } as const)

  if (state.status === "loading" || !hydrated || waiting) {
    return (
      <div
        role="status"
        aria-label="Loading your wishlist"
        className="grid grid-cols-2 gap-4 md:grid-cols-4"
      >
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="aspect-[4/5] w-full" />
        ))}
      </div>
    )
  }
  if (state.status === "error") {
    return (
      <EmptyState
        title="We could not load your wishlist"
        description="Please check your connection and try again."
        action={
          <button
            className={buttonVariants({ variant: "outline" })}
            onClick={() => {
              setResult(null)
              setAttempt((n) => n + 1)
            }}
          >
            Try again
          </button>
        }
      />
    )
  }
  if (state.items.length === 0) {
    return (
      <EmptyState
        icon={Heart}
        title="Your wishlist is empty"
        description="Tap the heart on any product to save it here."
        action={
          <Link href="/shop" className={buttonVariants()}>
            Browse products
          </Link>
        }
      />
    )
  }
  return <ProductGrid items={state.items} headingLevel={2} />
}
