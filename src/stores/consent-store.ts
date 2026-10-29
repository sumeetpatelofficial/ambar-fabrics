"use client"

import { create } from "zustand"
import {
  CONSENT_KEY,
  parseConsent,
  serializeConsent,
  shouldAsk,
  type ConsentChoice,
} from "@/lib/analytics/consent"
import { publicEnv } from "@/lib/env/public"

type ConsentState = {
  /** The saved choice has been read (it is read after the page loads, so server and browser HTML match). */
  loaded: boolean
  choice: ConsentChoice | null
  /** The banner is open: the visitor has not answered yet, or asked to change their answer. */
  asking: boolean
  /** True when the visitor opened the banner from the footer, so focus should move into it. */
  reopened: boolean
  load: () => void
  decide: (choice: ConsentChoice) => void
  reopen: () => void
}

function read(): string | null {
  try {
    return window.localStorage.getItem(CONSENT_KEY)
  } catch {
    return null
  }
}

export const useConsent = create<ConsentState>()((set) => ({
  loaded: false,
  choice: null,
  asking: false,
  reopened: false,
  load: () => {
    const stored = parseConsent(read())
    set({
      loaded: true,
      choice: stored?.choice ?? null,
      asking: shouldAsk(publicEnv.NEXT_PUBLIC_GA_MEASUREMENT_ID, stored),
    })
  },
  decide: (choice) => {
    try {
      window.localStorage.setItem(CONSENT_KEY, serializeConsent(choice))
    } catch {
      /* storage blocked: the choice holds for this visit only */
    }
    set({ choice, asking: false, reopened: false })
  },
  reopen: () => set({ asking: true, reopened: true }),
}))
