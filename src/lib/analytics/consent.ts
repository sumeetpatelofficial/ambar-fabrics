/**
 * Visitor choice about analytics cookies. Pure helpers, so the rules can be tested without a browser.
 * Nothing is sent to Google until the visitor says yes; saying no (or not answering) sends nothing.
 */
export type ConsentChoice = "granted" | "denied"
export type StoredConsent = { choice: ConsentChoice; at: number; version: number }

/** Raise this when what we collect changes, so everyone is asked again. */
export const CONSENT_VERSION = 1
/** A choice is asked about again after a year. */
export const CONSENT_MAX_AGE_MS = 365 * 86_400_000
export const CONSENT_KEY = "af-consent"

/** Stored data is untrusted (anyone can edit it). Anything unexpected counts as "not answered". */
export function parseConsent(
  raw: string | null | undefined,
  now = Date.now()
): StoredConsent | null {
  if (!raw) return null
  try {
    const v: unknown = JSON.parse(raw)
    if (typeof v !== "object" || v === null) return null
    const { choice, at, version } = v as Record<string, unknown>
    if (choice !== "granted" && choice !== "denied") return null
    if (typeof at !== "number" || !Number.isFinite(at) || at > now + 60_000) return null
    if (version !== CONSENT_VERSION) return null
    if (now - at > CONSENT_MAX_AGE_MS) return null
    return { choice, at, version }
  } catch {
    return null
  }
}

export function serializeConsent(choice: ConsentChoice, now = Date.now()): string {
  return JSON.stringify({ choice, at: now, version: CONSENT_VERSION } satisfies StoredConsent)
}

/** The banner is only shown when there is something to ask about: a Google Analytics id is set. */
export function shouldAsk(
  measurementId: string | undefined,
  stored: StoredConsent | null
): boolean {
  return Boolean(measurementId) && stored === null
}

/** Cookies Google Analytics sets: `_ga` and `_ga_<container>`. Used to clear them when consent is withdrawn. */
export function isGaCookie(name: string): boolean {
  return name === "_ga" || name.startsWith("_ga_") || name === "_gid" || name.startsWith("_gat")
}
