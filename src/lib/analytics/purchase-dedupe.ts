/**
 * A purchase must be reported once per order, however many times the confirmation page is opened,
 * refreshed or revisited. The orders already reported are remembered in this browser (and Google also
 * ignores a repeated `transaction_id`).
 */
export const PURCHASE_KEY = "af-ga-purchases"
const KEEP = 50
const ORDER_NUMBER = /^[A-Za-z0-9-]{4,40}$/

type Store = Pick<Storage, "getItem" | "setItem">

function read(store: Store): string[] {
  try {
    const v: unknown = JSON.parse(store.getItem(PURCHASE_KEY) ?? "[]")
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(-KEEP) : []
  } catch {
    return []
  }
}

/** True the first time it is asked for an order, false afterwards. Never throws. */
export function claimPurchase(store: Store | null, orderNumber: string): boolean {
  if (!ORDER_NUMBER.test(orderNumber)) return false
  if (!store) return true
  const seen = read(store)
  if (seen.includes(orderNumber)) return false
  try {
    store.setItem(PURCHASE_KEY, JSON.stringify([...seen, orderNumber].slice(-KEEP)))
  } catch {
    /* storage full or blocked: still report once for this page view */
  }
  return true
}
