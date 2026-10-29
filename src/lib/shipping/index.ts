import "server-only"
import { ConfigError } from "@/lib/errors"
import { getServerEnv, isGroupConfigured, requireGroup } from "@/lib/env/server"
import { createMockShipping } from "@/lib/shipping/mock"
import { createShiprocketProvider } from "@/lib/shipping/shiprocket"
import type { ShippingProvider } from "@/lib/shipping/types"

/**
 * Shiprocket when its sign-in is set (plus the pickup location and origin PIN code it needs). Otherwise the
 * stand-in in development and in the browser-test server; production without it refuses to ship.
 */
export function getShippingProvider(): ShippingProvider {
  const env = getServerEnv()
  if (isGroupConfigured("shiprocket")) {
    const k = requireGroup("shiprocket")
    if (!env.SHIPROCKET_PICKUP_LOCATION || !env.SHIPPING_ORIGIN_PINCODE)
      throw new ConfigError("Shipping needs a pickup location and origin PIN code.", [
        "SHIPROCKET_PICKUP_LOCATION",
        "SHIPPING_ORIGIN_PINCODE",
      ])
    return createShiprocketProvider({
      email: k.SHIPROCKET_EMAIL,
      password: k.SHIPROCKET_PASSWORD,
      pickupLocation: env.SHIPROCKET_PICKUP_LOCATION,
      originPincode: env.SHIPPING_ORIGIN_PINCODE,
      webhookToken: env.SHIPROCKET_WEBHOOK_TOKEN,
    })
  }
  if (env.NODE_ENV !== "production" || process.env.ENABLE_DEV_PAGES === "1")
    return createMockShipping()
  throw new ConfigError("Shipping is not configured.", ["SHIPROCKET_EMAIL", "SHIPROCKET_PASSWORD"])
}
