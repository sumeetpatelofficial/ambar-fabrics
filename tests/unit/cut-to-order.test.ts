import { describe, expect, it } from "vitest"
import { formatMetres, MAX_METRES, metresAt, MIN_METRES, priceForMetres } from "@/lib/cut-to-order"
import { home } from "@/content/home"

describe("the cut-to-order length", () => {
  it("runs from a quarter metre to three metres in quarter-metre steps", () => {
    expect(metresAt(0)).toBe(MIN_METRES)
    expect(metresAt(1)).toBe(MAX_METRES)
    expect(metresAt(0.5)).toBe(1.75) // 0.25 + 0.5 x 2.75 = 1.625, rounded to the nearest step
    for (let i = 0; i <= 200; i++) {
      const m = metresAt(i / 200)
      expect(m * 4).toBe(Math.round(m * 4)) // always a whole number of quarters
      expect(m).toBeGreaterThanOrEqual(MIN_METRES)
      expect(m).toBeLessThanOrEqual(MAX_METRES)
    }
  })

  it("never goes backwards as the page scrolls down", () => {
    let last = 0
    for (let i = 0; i <= 500; i++) {
      const m = metresAt(i / 500)
      expect(m).toBeGreaterThanOrEqual(last)
      last = m
    }
  })

  it("copes with odd input", () => {
    expect(metresAt(-1)).toBe(MIN_METRES)
    expect(metresAt(7)).toBe(MAX_METRES)
    expect(metresAt(Number.NaN)).toBe(MIN_METRES)
  })

  it("writes lengths the way the shop does", () => {
    expect(formatMetres(0.25)).toBe("0.25 m")
    expect(formatMetres(2.5)).toBe("2.5 m")
    expect(formatMetres(3)).toBe("3 m")
  })

  it("prices by the metre, in whole paise", () => {
    expect(priceForMetres(2.5, 22_000)).toBe(55_000) // Rs 550
    expect(priceForMetres(0.25, 22_000)).toBe(5_500)
    expect(priceForMetres(3, 22_000)).toBe(66_000)
    expect(Number.isInteger(priceForMetres(1.75, 33_333))).toBe(true)
  })
})

describe("the home page content", () => {
  it("holds no placeholder text, and takes the offer and the reviews from the shop's own data", () => {
    expect("active" in home.offer).toBe(false)
    expect("reviews" in home).toBe(false)
    expect(JSON.stringify(home)).not.toMatch(/\[[A-Z ]{3,}\]/) // no [CODE], [PRICE], [XX] left in the copy
  })

  it("has three slides and four looks, each with a link", () => {
    expect(home.hero.slides).toHaveLength(3)
    expect(home.wardrobe.looks).toHaveLength(4)
    for (const l of home.wardrobe.looks) expect(l.href).toMatch(/^\//)
    for (const s of home.hero.slides) expect(s.cta.href).toMatch(/^\//)
  })

  it("names every category card it can show", () => {
    for (const slug of home.categories.order) expect(home.categories.copy[slug], slug).toBeDefined()
  })
})
