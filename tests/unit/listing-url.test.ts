import { describe, expect, it } from "vitest"
import {
  activeFilterChips,
  isIndexableView,
  listingHref,
  paginationItems,
  parseListingParams,
  type ListingState,
} from "@/features/catalog/listing"

const base = (over: Partial<ListingState> = {}): ListingState => ({
  fabric: [],
  color: [],
  pattern: [],
  sort: "relevance",
  page: 1,
  ...over,
})

describe("parseListingParams", () => {
  it("applies defaults for an empty URL", () => {
    expect(parseListingParams({})).toMatchObject({ sort: "relevance", page: 1, fabric: [] })
  })

  it("drops invalid values and keeps the valid ones instead of failing", () => {
    const q = parseListingParams({ page: "abc", sort: "random", fabric: "cotton", minPrice: "100" })
    expect(q).toMatchObject({ page: 1, sort: "relevance", fabric: ["cotton"], minPrice: 100 })
  })

  it("drops an impossible price range as a whole", () => {
    const q = parseListingParams({ minPrice: "500", maxPrice: "100" })
    expect(q.minPrice).toBeUndefined()
  })

  it("never throws, whatever the input", () => {
    expect(() =>
      parseListingParams({
        pageSize: "9999",
        page: "-5",
        fabric: ["a".repeat(100)],
        q: "x".repeat(500),
      })
    ).not.toThrow()
  })
})

describe("listingHref", () => {
  it("omits defaults so the base URL stays clean", () => {
    expect(listingHref("/shop", base())).toBe("/shop")
    expect(listingHref("/shop", base({ page: 1 }))).toBe("/shop")
  })

  it("writes filters, sort and page", () => {
    expect(
      listingHref(
        "/categories/fabrics",
        base({ fabric: ["cotton", "crepe"], minPrice: 100, sort: "price_asc", page: 3 })
      )
    ).toBe("/categories/fabrics?fabric=cotton&fabric=crepe&minPrice=100&sort=price_asc&page=3")
  })

  it("treats a page's own default sort as the default", () => {
    expect(listingHref("/bestsellers", base({ sort: "popular" }), "popular")).toBe("/bestsellers")
    expect(listingHref("/bestsellers", base({ sort: "newest" }), "popular")).toBe(
      "/bestsellers?sort=newest"
    )
  })

  it("encodes search text", () => {
    expect(listingHref("/search", base({ q: "bandhani dupatta & more" }))).toBe(
      "/search?q=bandhani+dupatta+%26+more"
    )
  })

  it("round-trips through the parser", () => {
    const state = base({
      fabric: ["cotton"],
      color: ["green", "blue"],
      maxPrice: 300,
      availability: "in_stock",
      sort: "newest",
      page: 2,
    })
    const url = new URL(listingHref("/shop", state), "http://x")
    const raw: Record<string, string | string[]> = {}
    for (const key of new Set(url.searchParams.keys())) {
      const all = url.searchParams.getAll(key)
      raw[key] = all.length > 1 ? all : (all[0] as string)
    }
    expect(parseListingParams(raw)).toMatchObject(state)
  })
})

describe("activeFilterChips", () => {
  it("creates one removable chip per filter", () => {
    const state = base({
      fabric: ["cotton", "crepe"],
      minPrice: 100,
      maxPrice: 300,
      availability: "in_stock",
    })
    const chips = activeFilterChips(state)
    expect(chips.map((c) => c.label)).toEqual(["Cotton", "Crepe", "₹100 to ₹300", "In stock"])
    const cottonChip = chips[0]!
    expect(listingHref("/shop", cottonChip.remove)).toBe(
      "/shop?fabric=crepe&minPrice=100&maxPrice=300&availability=in_stock"
    )
  })

  it("resets to page 1 when a filter is removed", () => {
    const chip = activeFilterChips(base({ fabric: ["cotton"], page: 4 }))[0]!
    expect(chip.remove.page).toBe(1)
  })

  it("describes one-sided price ranges", () => {
    expect(activeFilterChips(base({ minPrice: 200 }))[0]!.label).toBe("From ₹200")
    expect(activeFilterChips(base({ maxPrice: 200 }))[0]!.label).toBe("Up to ₹200")
  })
})

describe("isIndexableView", () => {
  it("indexes the plain page, including later pages", () => {
    expect(isIndexableView(base())).toBe(true)
    expect(isIndexableView(base({ page: 3 }))).toBe(true)
  })

  it("does not index filtered, searched or re-sorted views", () => {
    expect(isIndexableView(base({ fabric: ["cotton"] }))).toBe(false)
    expect(isIndexableView(base({ q: "x" }))).toBe(false)
    expect(isIndexableView(base({ sort: "price_asc" }))).toBe(false)
    expect(isIndexableView(base({ availability: "in_stock" }))).toBe(false)
    expect(isIndexableView(base({ minPrice: 1 }))).toBe(false)
  })

  it("respects a page's default sort", () => {
    expect(isIndexableView(base({ sort: "popular" }), "popular")).toBe(true)
  })
})

describe("paginationItems", () => {
  it("shows everything when there are few pages", () => {
    expect(paginationItems(1, 1)).toEqual([1])
    expect(paginationItems(2, 4)).toEqual([1, 2, 3, 4])
  })

  it("collapses long ranges with gaps and always keeps first and last", () => {
    expect(paginationItems(1, 20)).toEqual([1, 2, null, 20])
    expect(paginationItems(10, 20)).toEqual([1, null, 9, 10, 11, null, 20])
    expect(paginationItems(20, 20)).toEqual([1, null, 19, 20])
  })

  it("fills a single-page gap instead of showing an ellipsis for one number", () => {
    expect(paginationItems(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(paginationItems(5, 20)).toEqual([1, null, 4, 5, 6, null, 20])
  })
})
