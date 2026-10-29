"use client"

import { publicEnv } from "@/lib/env/public"
import { useConsent } from "@/stores/consent-store"

/** Footer button to change the analytics choice. Hidden when there is nothing to choose about. */
export function CookieSettings() {
  const reopen = useConsent((s) => s.reopen)
  if (!publicEnv.NEXT_PUBLIC_GA_MEASUREMENT_ID) return null
  return (
    <li>
      <button
        type="button"
        onClick={reopen}
        className="inline-flex min-h-8 items-center hover:text-gold-dark"
      >
        Cookie settings
      </button>
    </li>
  )
}
