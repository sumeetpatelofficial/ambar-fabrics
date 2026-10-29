"use client"

import type { RefObject } from "react"
import { gsap, useGSAP } from "@/lib/gsap"

export type SceneEnv = {
  /** The visitor asked for less motion: build nothing that moves on scroll or on a timer. */
  reduce: boolean
  /** A phone-sized screen: shorter distances. */
  phone: boolean
}

/** Finds elements inside the section by selector. */
export type Pick = <T extends HTMLElement = HTMLElement>(selector: string) => T[]

/**
 * Runs a section's animations inside `gsap.matchMedia()`, so they follow the visitor's motion setting and
 * screen size, and are all undone when the section leaves the page (a route change included).
 */
export function useScene(
  scope: RefObject<HTMLElement | null>,
  build: (env: SceneEnv, pick: Pick) => void | (() => void),
  dependencies: unknown[] = []
) {
  useGSAP(
    () => {
      const root = scope.current
      if (!root) return
      const mm = gsap.matchMedia()
      mm.add(
        // `always` makes the callback run on every screen; the other two say which kind of screen it is.
        {
          always: "(min-width: 0px)",
          reduce: "(prefers-reduced-motion: reduce)",
          phone: "(max-width: 900px)",
        },
        (context) => {
          const { reduce, phone } = context.conditions as { reduce: boolean; phone: boolean }
          const pick: Pick = <T extends HTMLElement>(selector: string) =>
            gsap.utils.toArray<T>(selector, root)
          return build({ reduce: Boolean(reduce), phone: Boolean(phone) }, pick)
        }
      )
      return () => mm.revert()
    },
    { scope, dependencies }
  )
}
