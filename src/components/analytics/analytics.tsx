"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { useEffect } from "react"
import { isGaCookie } from "@/lib/analytics/consent"
import { setTracking, track } from "@/lib/analytics/track"
import { publicEnv } from "@/lib/env/public"
import { useConsent } from "@/stores/consent-store"

const ID = publicEnv.NEXT_PUBLIC_GA_MEASUREMENT_ID
const SCRIPT_ID = "ga-script"

function clearGaCookies() {
  for (const part of document.cookie.split(";")) {
    const name = part.split("=")[0]?.trim()
    if (!name || !isGaCookie(name)) continue
    const host = window.location.hostname
    for (const domain of [host, `.${host}`, `.${host.split(".").slice(-2).join(".")}`])
      document.cookie = `${name}=; Max-Age=0; path=/; domain=${domain}`
    document.cookie = `${name}=; Max-Age=0; path=/`
  }
}

/**
 * Loads Google Analytics only after the visitor agrees, reports page views as they move around the shop,
 * and stops (and clears Google's cookies) if they change their mind. Renders nothing.
 */
export function Analytics() {
  const { loaded, choice, load } = useConsent()
  const pathname = usePathname()
  const search = useSearchParams().toString()

  useEffect(() => load(), [load])

  useEffect(() => {
    if (!loaded) return
    if (!ID || choice !== "granted") {
      setTracking("off")
      if (ID) {
        ;(window as unknown as Record<string, unknown>)[`ga-disable-${ID}`] = true
        delete window.gtag
        clearGaCookies()
      }
      return
    }
    ;(window as unknown as Record<string, unknown>)[`ga-disable-${ID}`] = false
    window.dataLayer = window.dataLayer ?? []
    window.gtag = function gtag() {
      // GA reads `arguments` objects from the data layer, not arrays.
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments)
    }
    window.gtag("js", new Date())
    // Page views are sent by hand below, so the shop's own navigation is counted once each.
    window.gtag("config", ID, { send_page_view: false, allow_google_signals: false })
    if (!document.getElementById(SCRIPT_ID)) {
      const s = document.createElement("script")
      s.id = SCRIPT_ID
      s.async = true
      s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ID)}`
      document.head.appendChild(s)
    }
    setTracking("on")
  }, [loaded, choice])

  useEffect(() => {
    if (!loaded || choice !== "granted" || pathname.startsWith("/admin")) return
    track({
      name: "page_view",
      params: {
        page_path: pathname + (search ? `?${search}` : ""),
        page_location: window.location.href,
        page_title: document.title,
      },
    })
  }, [loaded, choice, pathname, search])

  return null
}
