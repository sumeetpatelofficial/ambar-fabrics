import "server-only"
import { ValidationError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { getShippingProvider } from "@/lib/shipping"

const PINCODE = /^[1-9]\d{5}$/

// ------------------------------------------------------------------ before ordering

export type DeliveryCheck = { serviceable: boolean; etaDays?: number } | { error: string }

/** Whether couriers serve a PIN code. Used on product and checkout pages. */
export async function checkDelivery(pincode: string): Promise<DeliveryCheck> {
  if (!PINCODE.test(pincode)) return { error: "Enter a 6-digit PIN code." }
  try {
    const result = await getShippingProvider().checkServiceability({ pincode, weightGrams: 500 })
    return result.serviceable
      ? { serviceable: true, ...(result.etaDays ? { etaDays: result.etaDays } : {}) }
      : { serviceable: false }
  } catch {
    return { error: "We could not check that PIN code right now. Please try again." }
  }
}

/**
 * Stops an order that no courier can deliver. If the courier service itself cannot be reached the order is
 * allowed (a lost sale is worse than a delivery question staff can resolve), and the failure is logged.
 */
export async function assertDeliverable(pincode: string, weightGrams: number): Promise<void> {
  try {
    const result = await getShippingProvider().checkServiceability({ pincode, weightGrams })
    if (!result.serviceable)
      throw new ValidationError("Sorry, we cannot deliver to that PIN code yet.")
  } catch (error) {
    if (error instanceof ValidationError) throw error
    logger.warn(
      { event: "shipping.serviceability_unavailable", errorName: (error as Error).name },
      "Could not check serviceability; allowing the order"
    )
  }
}
