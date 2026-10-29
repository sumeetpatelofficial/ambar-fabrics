"use client"

import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { useGSAP } from "@gsap/react"

/**
 * The one place GSAP's plugins are registered. Every animated home section imports from here, so the
 * registration happens once, in the browser only.
 */
if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, useGSAP)
  // How many scroll triggers are alive. Read by the browser tests, to prove leaving a page cleans up.
  Object.defineProperty(window, "__scrollTriggerCount", {
    configurable: true,
    get: () => ScrollTrigger.getAll().length,
  })
}

export { gsap, ScrollTrigger, useGSAP }
