"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { useConsent } from "@/stores/consent-store"

/**
 * Asks once, at the bottom of the page, without blocking anything. "No thanks" is as easy as
 * "Accept". Shown only when Google Analytics is set up and the visitor has not answered.
 */
export function ConsentBanner() {
  const asking = useConsent((s) => s.asking)
  const reopened = useConsent((s) => s.reopened)
  const decide = useConsent((s) => s.decide)
  const pathname = usePathname()
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (asking && reopened) heading.current?.focus()
  }, [asking, reopened])

  // The staff area is not part of the shop's analytics, so it never asks.
  if (!asking || pathname.startsWith("/admin")) return null
  return (
    <section
      aria-labelledby="consent-title"
      className="fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-3xl flex-col gap-4 border bg-background p-5 shadow-lg sm:flex-row sm:items-center print:hidden"
    >
      <div className="flex-1">
        <h2
          id="consent-title"
          ref={heading}
          tabIndex={-1}
          className="font-sans text-base font-medium"
        >
          Help us see what is popular
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          With your say-so we use Google Analytics to count visits and see which pages and fabrics
          people look at. Nothing is collected unless you accept. Your bag and sign-in work either
          way.{" "}
          <Link href="/privacy-policy" className="underline underline-offset-4">
            Privacy policy
          </Link>
        </p>
      </div>
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => decide("denied")}>
          No thanks
        </Button>
        <Button onClick={() => decide("granted")}>Accept analytics</Button>
      </div>
    </section>
  )
}
