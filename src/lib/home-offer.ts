/**
 * The home page's festive offer, as plain data and the words built from it. Pure (no server imports) so the
 * page, the browser component and the tests all use the same text.
 */
export type HomeOffer = {
  code: string
  kind: "percent" | "flat"
  /** The percentage (for example 15) or the rupee amount off (for example 200). */
  figure: number
  /** The last day, as text in India time ("5 November"), when the coupon has an end date. */
  endsOn?: string
  /** The smallest order in whole rupees, when there is one. */
  minimumRupees?: number
}

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`

/** "15% off" or "₹200 off". */
export function offerHeadline(o: HomeOffer): { big: string; small: string } {
  return o.kind === "percent"
    ? { big: String(o.figure), small: "% off" }
    : { big: rupees(o.figure), small: " off" }
}

/** The same in one piece, for the ticker and spoken text. */
export function offerSummary(o: HomeOffer): string {
  return o.kind === "percent" ? `${o.figure}% off` : `${rupees(o.figure)} off`
}

/** The one line that repeats along the top of the band. Parts the coupon does not have are left out. */
export function tickerLine(o: HomeOffer, what: string): string {
  return [
    "Festive offer",
    `${offerSummary(o)} ${what}`,
    `Code ${o.code}`,
    ...(o.endsOn ? [`Ends ${o.endsOn}`] : []),
  ]
    .map((part) => `${part}  ·  `)
    .join("")
}

/** The small print on the coupon. */
export function terms(o: HomeOffer): string {
  const min = o.minimumRupees ? ` on orders above ${rupees(o.minimumRupees)}` : ""
  const valid = o.endsOn ? ` Valid until ${o.endsOn}${min}.` : min ? ` Valid${min}.` : ""
  return `Apply at checkout.${valid} One code per order.`
}

/** "5 November" for a date, in India time. */
export function dayText(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    timeZone: "Asia/Kolkata",
  }).format(date)
}
