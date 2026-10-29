"use client"

import { Suspense, useEffect, type ReactNode } from "react"
import { MotionConfig } from "motion/react"
import { SessionProvider } from "next-auth/react"
import { Analytics } from "@/components/analytics/analytics"
import { ConsentBanner } from "@/components/analytics/consent-banner"
import { AuthSync } from "@/components/auth-sync"
import { Toaster } from "@/components/ui/sonner"
import { useBag } from "@/stores/bag-store"
import { useWishlist } from "@/stores/wishlist-store"

/**
 * Client-side providers. `reducedMotion="user"` makes every Motion animation respect the visitor's
 * prefers-reduced-motion setting (transform and layout animations are disabled).
 */
export function Providers({ children }: { children: ReactNode }) {
  // Saved data loads after mount so the server HTML and the first client render are identical.
  useEffect(() => {
    void useBag.persist.rehydrate()
    void useWishlist.persist.rehydrate()
  }, [])

  return (
    <SessionProvider refetchOnWindowFocus={false}>
      <MotionConfig reducedMotion="user">
        {children}
        {/* The current path is only known at request time, so it must sit in a Suspense boundary. */}
        <Suspense fallback={null}>
          <AuthSync />
          <Analytics />
          <ConsentBanner />
        </Suspense>
        <Toaster position="bottom-center" />
      </MotionConfig>
    </SessionProvider>
  )
}
