/** Small hex colour helpers used to derive placeholder artwork from a product's swatch. */
function parse(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return [217, 205, 180]
  const n = parseInt(m[1] as string, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const toHex = (c: number) =>
  Math.round(Math.min(255, Math.max(0, c)))
    .toString(16)
    .padStart(2, "0")

/** Mixes `hex` toward `target` by `amount` (0 keeps hex, 1 gives target). */
export function mix(hex: string, target: string, amount: number): string {
  const a = parse(hex)
  const b = parse(target)
  return `#${[0, 1, 2].map((i) => toHex((a[i] as number) * (1 - amount) + (b[i] as number) * amount)).join("")}`
}

export const lighten = (hex: string, amount: number) => mix(hex, "#ffffff", amount)
export const darken = (hex: string, amount: number) => mix(hex, "#000000", amount)

/** Relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const f = (c: number) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const [r, g, b] = parse(hex)
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
