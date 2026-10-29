"use client"

import { useEffect, type ReactNode } from "react"
import { ScrollTrigger } from "@/lib/gsap"
import "./home.css"

/**
 * Wraps the home page. Pinned sections measure the page, so once the fonts and the images have loaded
 * (which change the page's size) every scroll trigger measures again.
 */
export function HomeMotionRoot({ children }: { children: ReactNode }) {
  useEffect(() => {
    let alive = true
    const refresh = () => {
      if (alive) ScrollTrigger.refresh()
    }
    void document.fonts?.ready.then(refresh)
    window.addEventListener("load", refresh)
    const late = window.setTimeout(refresh, 1200)
    return () => {
      alive = false
      window.removeEventListener("load", refresh)
      window.clearTimeout(late)
    }
  }, [])

  return <div className="home">{children}</div>
}
