import { rupeesToPaise } from "@/lib/money"

/** Rupees typed by a person to paise, or null when it is not a valid amount. */
export function paiseFromRupeeText(text: string): number | null {
  try {
    const paise = rupeesToPaise(text)
    return paise > 0 ? paise : null
  } catch {
    return null
  }
}
