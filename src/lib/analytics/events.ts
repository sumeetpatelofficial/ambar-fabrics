import { baseToDisplayString, type SellingUnit } from "@/lib/measure"

/**
 * GA4 e-commerce events as plain data. Everything here is pure, so the exact numbers sent to Google
 * can be tested. Conventions (also in docs/analytics.md):
 *  - money is in rupees (GA4 wants decimals), currency INR;
 *  - `item_id` is the product's web address (slug), the same on every page, so a funnel lines up;
 *  - `quantity` is in the unit the shop sells by (2.5 for 2.5 metres, 3 for three pieces) and `price`
 *    is per that unit, so `price * quantity` is the line total.
 */
export const CURRENCY = "INR"

export type GaItem = {
  item_id: string
  item_name: string
  item_variant?: string
  item_category?: string
  item_list_name?: string
  index?: number
  price: number
  quantity: number
  discount?: number
}

/** Exact rupees from paise, with no floating-point drift (12345 -> 123.45). */
export function rupees(paise: number): number {
  return Math.round(paise) / 100
}

/** Quantity in display units: 2500 mm of a per-metre fabric is 2.5; 3 pieces is 3. */
export function displayQuantity(unit: SellingUnit, qty: number): number {
  return Number(baseToDisplayString(unit, qty))
}

type LineInput = {
  slug: string
  name: string
  colorName?: string
  size?: string
  unit: SellingUnit
  qty: number
  unitPricePaise: number
  discountPaise?: number
}

const variantLabel = (c?: string, s?: string) => [c, s].filter(Boolean).join(" / ") || undefined

/** A line in a bag, checkout or order. */
export function lineItem(l: LineInput, extra: Partial<GaItem> = {}): GaItem {
  const quantity = displayQuantity(l.unit, l.qty)
  const label = variantLabel(l.colorName, l.size)
  return {
    item_id: l.slug,
    item_name: l.name,
    ...(label ? { item_variant: label } : {}),
    // price per display unit, so price x quantity is the line total
    price: rupees(l.unitPricePaise * (l.unit.baseUnitsPerDisplayUnit / l.unit.pricePerBaseUnits)),
    quantity,
    ...(l.discountPaise ? { discount: rupees(l.discountPaise) } : {}),
    ...extra,
  }
}

type CardInput = { slug: string; name: string; pricePaise: number }
/** A product shown in a list or on its page (not yet in a bag): one unit at the lowest price. */
export function productItem(p: CardInput, extra: Partial<GaItem> = {}): GaItem {
  return { item_id: p.slug, item_name: p.name, price: rupees(p.pricePaise), quantity: 1, ...extra }
}

const total = (items: GaItem[]) =>
  Math.round(items.reduce((sum, i) => sum + i.price * i.quantity * 100, 0)) / 100

export type GaEvent = { name: string; params: Record<string, unknown> }

export const events = {
  viewItemList(listName: string, products: CardInput[]): GaEvent {
    return {
      name: "view_item_list",
      params: {
        item_list_name: listName,
        items: products.map((p, index) => productItem(p, { item_list_name: listName, index })),
      },
    }
  },
  selectItem(listName: string, product: CardInput, index: number): GaEvent {
    return {
      name: "select_item",
      params: {
        item_list_name: listName,
        items: [productItem(product, { item_list_name: listName, index })],
      },
    }
  },
  viewItem(product: CardInput, category?: string): GaEvent {
    const item = productItem(product, category ? { item_category: category } : {})
    return { name: "view_item", params: { currency: CURRENCY, value: item.price, items: [item] } }
  },
  addToCart(item: GaItem): GaEvent {
    return {
      name: "add_to_cart",
      params: { currency: CURRENCY, value: total([item]), items: [item] },
    }
  },
  removeFromCart(item: GaItem): GaEvent {
    return {
      name: "remove_from_cart",
      params: { currency: CURRENCY, value: total([item]), items: [item] },
    }
  },
  addToWishlist(product: CardInput): GaEvent {
    const item = productItem(product)
    return {
      name: "add_to_wishlist",
      params: { currency: CURRENCY, value: item.price, items: [item] },
    }
  },
  viewCart(items: GaItem[]): GaEvent {
    return { name: "view_cart", params: { currency: CURRENCY, value: total(items), items } }
  },
  beginCheckout(items: GaItem[], coupon?: string): GaEvent {
    return {
      name: "begin_checkout",
      params: { currency: CURRENCY, value: total(items), items, ...(coupon ? { coupon } : {}) },
    }
  },
  addShippingInfo(items: GaItem[], shippingTier: string, coupon?: string): GaEvent {
    return {
      name: "add_shipping_info",
      params: {
        currency: CURRENCY,
        value: total(items),
        shipping_tier: shippingTier,
        items,
        ...(coupon ? { coupon } : {}),
      },
    }
  },
  addPaymentInfo(items: GaItem[], paymentType: string, coupon?: string): GaEvent {
    return {
      name: "add_payment_info",
      params: {
        currency: CURRENCY,
        value: total(items),
        payment_type: paymentType,
        items,
        ...(coupon ? { coupon } : {}),
      },
    }
  },
  /** `valuePaise` is what the customer paid (items less discounts, plus shipping and any tax). */
  purchase(order: {
    orderNumber: string
    valuePaise: number
    taxPaise: number
    shippingPaise: number
    coupon?: string
    items: GaItem[]
  }): GaEvent {
    return {
      name: "purchase",
      params: {
        transaction_id: order.orderNumber,
        currency: CURRENCY,
        value: rupees(order.valuePaise),
        tax: rupees(order.taxPaise),
        shipping: rupees(order.shippingPaise),
        ...(order.coupon ? { coupon: order.coupon } : {}),
        items: order.items,
      },
    }
  },
  search(term: string): GaEvent {
    return { name: "search", params: { search_term: term.slice(0, 100) } }
  },
  viewSearchResults(term: string, count: number): GaEvent {
    return {
      name: "view_search_results",
      params: { search_term: term.slice(0, 100), result_count: count },
    }
  },
}
