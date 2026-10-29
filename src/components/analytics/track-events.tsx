"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { events, lineItem, type GaItem } from "@/lib/analytics/events"
import { claimPurchase } from "@/lib/analytics/purchase-dedupe"
import { track } from "@/lib/analytics/track"

type Product = { slug: string; name: string; pricePaise: number }

/** Reports that a product page was opened. Renders nothing. */
export function TrackViewItem({ product, category }: { product: Product; category?: string }) {
  useEffect(() => {
    track(events.viewItem(product, category))
    // One report per product page opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.slug])
  return null
}

/**
 * Wraps a list of product cards: reports that the list was seen, and which card was chosen.
 * The cards themselves stay server-rendered; a click is matched to its product by the link's address.
 */
export function TrackedList({
  listName,
  products,
  children,
}: {
  listName: string
  products: Product[]
  children: ReactNode
}) {
  const key = products.map((p) => p.slug).join(",")
  useEffect(() => {
    if (products.length > 0) track(events.viewItemList(listName, products))
    // `key` stands for the products.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listName, key])
  return (
    <div
      onClickCapture={(e) => {
        const link = (e.target as HTMLElement).closest("a[href^='/products/']")
        if (!link) return
        const slug = link.getAttribute("href")!.slice("/products/".length).split(/[?#]/)[0]
        const index = products.findIndex((p) => p.slug === slug)
        if (index >= 0) track(events.selectItem(listName, products[index]!, index))
      }}
    >
      {children}
    </div>
  )
}

type CartLine = Parameters<typeof lineItem>[0]

/** The bag as it was shown. Fires once per distinct bag. */
export function TrackViewCart({ lines }: { lines: CartLine[] }) {
  const key = lines.map((l) => `${l.slug}:${l.qty}`).join(",")
  useEffect(() => {
    if (lines.length > 0) track(events.viewCart(lines.map((l) => lineItem(l))))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return null
}

export function TrackBeginCheckout({ lines, coupon }: { lines: CartLine[]; coupon?: string }) {
  const sent = useRef(false)
  useEffect(() => {
    if (sent.current || lines.length === 0) return
    sent.current = true
    track(
      events.beginCheckout(
        lines.map((l) => lineItem(l)),
        coupon
      )
    )
    // Once per visit to the checkout page, not on every coupon change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines.length])
  return null
}

/** Reports a paid order once, however often the confirmation page is opened. */
export function TrackPurchase({
  orderNumber,
  valuePaise,
  taxPaise,
  shippingPaise,
  coupon,
  lines,
}: {
  orderNumber: string
  valuePaise: number
  taxPaise: number
  shippingPaise: number
  coupon?: string
  lines: (CartLine & { discountPaise?: number })[]
}) {
  useEffect(() => {
    let store: Storage | null = null
    try {
      store = window.localStorage
    } catch {
      store = null
    }
    if (!claimPurchase(store, orderNumber)) return
    const items: GaItem[] = lines.map((l) => lineItem(l))
    track(events.purchase({ orderNumber, valuePaise, taxPaise, shippingPaise, coupon, items }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderNumber])
  return null
}

export function TrackSearch({ term, count }: { term: string; count: number }) {
  useEffect(() => {
    track(events.search(term))
    track(events.viewSearchResults(term, count))
  }, [term, count])
  return null
}
