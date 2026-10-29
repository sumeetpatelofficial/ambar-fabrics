import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

/** Guards the palette: changing a token in globals.css cannot silently break WCAG contrast. */
const css = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8")
const rootBlock = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")))

function token(name: string): string {
  const match = rootBlock.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!match?.[1]) throw new Error(`token --${name} not found as a 6-digit hex in :root`)
  return match[1]
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ]
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

const text = 4.5 // WCAG 1.4.3 normal text
const ui = 3 // WCAG 1.4.11 non-text (control edges, focus rings)

describe("palette contrast", () => {
  const pairs: [string, string, string, number][] = [
    ["foreground on background", "foreground", "background", text],
    ["foreground on card", "card-foreground", "card", text],
    ["foreground on secondary (linen)", "secondary-foreground", "secondary", text],
    ["primary-foreground on primary (buttons)", "primary-foreground", "primary", text],
    ["muted text on background", "muted-foreground", "background", text],
    ["muted text on secondary (footer)", "muted-foreground", "secondary", text],
    ["muted text on muted", "muted-foreground", "muted", text],
    ["madder text on background", "madder", "background", text],
    ["madder text on secondary", "madder", "secondary", text],
    ["brass text on background", "brass", "background", text],
    ["destructive text on background", "destructive", "background", text],
    ["input edge on background", "input", "background", ui],
    ["focus ring on background", "ring", "background", ui],
  ]

  it.each(pairs)("%s meets its minimum", (_label, fg, bg, min) => {
    expect(ratio(token(fg), token(bg))).toBeGreaterThanOrEqual(min)
  })
})
