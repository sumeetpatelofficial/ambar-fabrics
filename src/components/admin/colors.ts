/**
 * The admin's accent colours. Each "soft" tint is paired with an "ink" colour dark enough to read on it
 * (4.5:1 or better), so coloured tiles and badges stay accessible.
 */
export const ACCENT = {
  green: { solid: "#1f9d6b", soft: "#e4f5ec", ink: "#0e6b46" },
  blue: { solid: "#3b82f6", soft: "#e8f0fe", ink: "#1d4ed8" },
  violet: { solid: "#8b5cf6", soft: "#f0eafe", ink: "#6d28d9" },
  amber: { solid: "#f59e0b", soft: "#fff1de", ink: "#8a5a00" },
  red: { solid: "#e5484d", soft: "#fdecea", ink: "#b3261e" },
  grey: { solid: "#6b7280", soft: "#eceff3", ink: "#4b5563" },
} as const
export type Accent = keyof typeof ACCENT

/** Inline style for a tinted tile or badge. */
export const tint = (a: Accent) => ({ backgroundColor: ACCENT[a].soft, color: ACCENT[a].ink })

/** A steady colour per person, for initials that stand in for a photograph. */
export function avatarColor(seed: string): string {
  const h = [...seed].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 360, 7)
  return `hsl(${h} 48% 38%)`
}
