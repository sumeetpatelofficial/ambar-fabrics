import { describe, expect, it, vi } from "vitest"
import {
  dayText,
  offerHeadline,
  offerSummary,
  terms,
  tickerLine,
  type HomeOffer,
} from "@/lib/home-offer"
import { shortenQuote } from "@/lib/review-quote"

const percent: HomeOffer = {
  code: "FESTIVE15",
  kind: "percent",
  figure: 15,
  endsOn: "5 November",
  minimumRupees: 1500,
}
const flat: HomeOffer = { code: "FLAT200", kind: "flat", figure: 200 }

describe("the festive offer text", () => {
  it("writes a percentage and a rupee amount", () => {
    expect(offerHeadline(percent)).toEqual({ big: "15", small: "% off" })
    expect(offerHeadline(flat)).toEqual({ big: "₹200", small: " off" })
    expect(offerSummary(percent)).toBe("15% off")
    expect(offerSummary({ ...flat, figure: 1500 })).toBe("₹1,500 off")
  })

  it("builds the ticker from what the coupon has and leaves out what it lacks", () => {
    expect(tickerLine(percent, "on your order")).toBe(
      "Festive offer  ·  15% off on your order  ·  Code FESTIVE15  ·  Ends 5 November  ·  "
    )
    expect(tickerLine(flat, "on your order")).toBe(
      "Festive offer  ·  ₹200 off on your order  ·  Code FLAT200  ·  "
    )
  })

  it("writes the small print for every combination", () => {
    expect(terms(percent)).toBe(
      "Apply at checkout. Valid until 5 November on orders above ₹1,500. One code per order."
    )
    expect(terms({ ...percent, minimumRupees: undefined })).toBe(
      "Apply at checkout. Valid until 5 November. One code per order."
    )
    expect(terms({ ...percent, endsOn: undefined })).toBe(
      "Apply at checkout. Valid on orders above ₹1,500. One code per order."
    )
    expect(terms(flat)).toBe("Apply at checkout. One code per order.")
  })

  it("gives a date in India time", () => {
    expect(dayText(new Date("2026-11-05T20:00:00Z"))).toBe("6 November") // already the 6th in India
    expect(dayText(new Date("2026-11-05T10:00:00Z"))).toBe("5 November")
  })
})

describe("shortening a review", () => {
  it("leaves short reviews alone, and tidies spaces", () => {
    expect(shortenQuote("  Lovely   cloth.  ")).toBe("Lovely cloth.")
  })

  it("cuts long ones at a whole word with an ellipsis, never over the limit", () => {
    const long = "word ".repeat(100).trim()
    const out = shortenQuote(long, 60)
    expect(out.endsWith("…")).toBe(true)
    expect(out.length).toBeLessThanOrEqual(61)
    expect(out.slice(0, -1).endsWith("word")).toBe(true)
  })

  it("does not leave a dangling comma or stop before the ellipsis", () => {
    expect(
      shortenQuote("The cloth was good, and the colour was right, truly lovely work.", 30)
    ).toMatch(/[a-z]…$/)
  })

  it("handles one very long word", () => {
    expect(shortenQuote("x".repeat(500), 50)).toBe("x".repeat(50) + "…")
  })
})

describe("the stand-in content for a development site", () => {
  it("is shown only outside production, unless asked for", async () => {
    const { showHomeSamples, sampleOffer, sampleReviews } = await import("@/content/home-samples")
    const was = { env: process.env.NODE_ENV, flag: process.env.HOME_SAMPLE_SECTIONS }
    try {
      vi.stubEnv("NODE_ENV", "production")
      vi.stubEnv("HOME_SAMPLE_SECTIONS", "")
      expect(showHomeSamples()).toBe(false)
      vi.stubEnv("HOME_SAMPLE_SECTIONS", "1")
      expect(showHomeSamples()).toBe(true)
      vi.stubEnv("NODE_ENV", "development")
      vi.stubEnv("HOME_SAMPLE_SECTIONS", "")
      expect(showHomeSamples()).toBe(true)
    } finally {
      vi.unstubAllEnvs()
      void was
    }
    const offer = sampleOffer(new Date("2026-10-20T06:00:00Z"))
    expect(offer).toMatchObject({
      code: "FESTIVE15",
      kind: "percent",
      figure: 15,
      endsOn: "19 November",
    })
    // Enough reviews to show the drifting rows, each with only a short name.
    expect(sampleReviews.length).toBeGreaterThanOrEqual(4)
    for (const r of sampleReviews) expect(r.name).toMatch(/^[A-Z][a-z]+ [A-Z]\.$/)
  })
})
