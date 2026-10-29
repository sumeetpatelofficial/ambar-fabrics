import type { GaEvent } from "./events"

type GtagFn = (...args: unknown[]) => void
declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: GtagFn
  }
}

/**
 * Sends events to Google Analytics, but only while the visitor has agreed.
 *  - "pending": the page has just loaded and the saved choice is not read yet. Events wait (briefly).
 *  - "on":      the visitor agreed. Waiting events are sent, then new ones go straight out.
 *  - "off":     no answer, or "no thanks". Events are dropped and nothing leaves the browser.
 */
type Mode = "pending" | "on" | "off"
let mode: Mode = "pending"
let queue: GaEvent[] = []
const QUEUE_LIMIT = 50

function send(event: GaEvent) {
  try {
    window.gtag?.("event", event.name, event.params)
  } catch {
    /* analytics must never break the shop */
  }
}

export function setTracking(next: "on" | "off"): void {
  mode = next
  const waiting = queue
  queue = []
  if (next === "on") for (const e of waiting) send(e)
}

export function track(event: GaEvent): void {
  if (typeof window === "undefined" || mode === "off") return
  if (mode === "pending") {
    if (queue.length < QUEUE_LIMIT) queue.push(event)
    return
  }
  send(event)
}

/** For tests: back to the state of a fresh page load. */
export function resetTracking(): void {
  mode = "pending"
  queue = []
}
