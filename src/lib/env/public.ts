import { parsePublicEnv } from "./schema"

/**
 * Browser-safe configuration. Every NEXT_PUBLIC_* variable must be referenced explicitly here:
 * Next.js inlines them at build time and cannot do so through a dynamic `process.env[key]` lookup.
 * An invalid value fails the build rather than shipping a broken bundle.
 */
export const publicEnv = parsePublicEnv(
  {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_RAZORPAY_KEY_ID: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    NEXT_PUBLIC_GA_MEASUREMENT_ID: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
  },
  process.env.NODE_ENV
)
