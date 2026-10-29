"use client"

import { useSession } from "next-auth/react"
import { useState } from "react"
import { toast } from "sonner"
import { addToCartAction } from "@/features/cart/actions"
import { events, lineItem } from "@/lib/analytics/events"
import { track } from "@/lib/analytics/track"
import { formatQuantity, type SellingUnit } from "@/lib/measure"
import { useBag } from "@/stores/bag-store"

export type AddableVariant = {
  id: string
  colorName?: string
  size?: string
  unit: SellingUnit
  pricePaise: number
}

/**
 * Adds an item to the bag: to the account when signed in (the screen changes only after the server
 * agrees), otherwise to this browser. Shared by the product page and the quick add on list cards.
 */
export function useAddToBag(product: { slug: string; name: string }) {
  const { status } = useSession()
  const bagSynced = useBag((s) => s.synced)
  const addToLocalBag = useBag((s) => s.add)
  const [adding, setAdding] = useState(false)
  // Until it is known who is signed in, adding would go to the wrong place (this browser instead of the account).
  const waiting = status === "loading" || (status === "authenticated" && !bagSynced)

  /** Returns a sentence to say aloud: what was added, or why it was not. */
  async function add(
    variant: AddableVariant,
    qty: number
  ): Promise<{ ok: boolean; message: string }> {
    if (status === "authenticated") {
      setAdding(true)
      const result = await addToCartAction(variant.id, qty)
      setAdding(false)
      if (!result.ok) {
        toast.error("We could not add that to your bag", { description: result.message })
        return { ok: false, message: result.message }
      }
      useBag.getState().replace(result.lines)
    } else {
      addToLocalBag(variant.id, qty)
    }
    track(
      events.addToCart(
        lineItem({
          slug: product.slug,
          name: product.name,
          colorName: variant.colorName,
          size: variant.size,
          unit: variant.unit,
          qty,
          unitPricePaise: variant.pricePaise,
        })
      )
    )
    const summary = `${product.name}, ${formatQuantity(variant.unit, qty)}`
    toast.success("Added to your bag", { description: summary })
    return { ok: true, message: `Added to your bag: ${summary}` }
  }

  return { add, adding, waiting }
}
