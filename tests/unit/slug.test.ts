import { describe, expect, it } from "vitest"
import { isValidSlug, slugify } from "@/lib/slug"

describe("slugify", () => {
  it("makes clean lowercase ASCII slugs", () => {
    expect(slugify("Handloom Cotton, Sage Green")).toBe("handloom-cotton-sage-green")
    expect(slugify("Crêpe & Chinon")).toBe("crepe-and-chinon")
    expect(slugify("  --Ajrakh   print!!  ")).toBe("ajrakh-print")
  })

  it("caps the length without leaving a trailing hyphen", () => {
    const slug = slugify("word ".repeat(40))
    expect(slug.length).toBeLessThanOrEqual(80)
    expect(slug.endsWith("-")).toBe(false)
  })

  it("returns an empty string when nothing usable remains", () => {
    expect(slugify("बांधनी")).toBe("")
    expect(slugify("!!!")).toBe("")
  })
})

describe("isValidSlug", () => {
  it("accepts and rejects the right shapes", () => {
    for (const ok of ["cotton", "modal-silk-2", "a1"]) expect(isValidSlug(ok)).toBe(true)
    for (const bad of ["", "Cotton", "a--b", "-a", "a-", "a b", "a/b", "ä", "x".repeat(81)]) {
      expect(isValidSlug(bad), bad).toBe(false)
    }
  })
})
