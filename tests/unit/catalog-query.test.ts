import { describe, expect, it } from "vitest"
import {
  productListQuerySchema,
  searchParamsToObject,
  slugParamSchema,
  suggestQuerySchema,
} from "@/features/catalog/schemas"
import { escapeRegex, sanitizeSearchText } from "@/services/catalog-service"

const parse = (qs: string) =>
  productListQuerySchema.safeParse(searchParamsToObject(new URLSearchParams(qs)))

describe("productListQuerySchema", () => {
  it("applies defaults", () => {
    expect(parse("").data).toMatchObject({
      sort: "relevance",
      page: 1,
      pageSize: 24,
      fabric: [],
      color: [],
      pattern: [],
    })
  })

  it("accepts single or repeated filter values and normalises them", () => {
    expect(parse("fabric=Cotton").data?.fabric).toEqual(["cotton"])
    expect(parse("fabric=cotton&fabric=%20Crepe%20&color=sage").data).toMatchObject({
      fabric: ["cotton", "crepe"],
      color: ["sage"],
    })
  })

  it("coerces numbers from the URL", () => {
    expect(parse("page=3&pageSize=12&minPrice=100&maxPrice=500").data).toMatchObject({
      page: 3,
      pageSize: 12,
      minPrice: 100,
      maxPrice: 500,
    })
  })

  it.each([
    "page=0",
    "page=501",
    "pageSize=0",
    "pageSize=61",
    "page=1.5",
    "page=abc",
    "minPrice=-1",
    "minPrice=500&maxPrice=100",
    "sort=random",
    "availability=out_of_stock",
    "category=Bad%20Slug",
    "category=" + "a".repeat(81),
    "q=" + "x".repeat(81),
    "fabric=" + "a".repeat(41),
    Array.from({ length: 11 }, (_, i) => `fabric=f${i}`).join("&"),
  ])("rejects %s", (qs) => {
    expect(parse(qs).success).toBe(false)
  })

  it("reports which field failed", () => {
    const result = parse("pageSize=999")
    expect(!result.success && result.error.issues[0]?.path).toEqual(["pageSize"])
  })

  it("passes operator-looking strings through as plain strings, never objects", () => {
    expect(parse("fabric[$ne]=x").data?.fabric).toEqual([]) // bracket syntax is just an unknown key
    expect(parse("q=%7B%22%24ne%22%3A1%7D").data?.q).toBe('{"$ne":1}')
  })
})

describe("other schemas", () => {
  it("suggest needs at least two characters", () => {
    expect(suggestQuerySchema.safeParse({ q: "a" }).success).toBe(false)
    expect(suggestQuerySchema.safeParse({ q: "ba" }).success).toBe(true)
  })

  it("slug params must be valid slugs", () => {
    expect(slugParamSchema.safeParse({ slug: "handloom-cotton" }).success).toBe(true)
    expect(slugParamSchema.safeParse({ slug: "../etc/passwd" }).success).toBe(false)
    expect(slugParamSchema.safeParse({ slug: "UPPER" }).success).toBe(false)
  })
})

describe("search text helpers", () => {
  it("strips phrase quotes and negation so visitors get plain word matching", () => {
    expect(sanitizeSearchText('"bandhani" -dupatta  cotton')).toBe("bandhani dupatta cotton")
    expect(sanitizeSearchText("  --  ")).toBe("")
    expect(sanitizeSearchText("a\\b")).toBe("a b")
    expect(sanitizeSearchText("x".repeat(200))).toHaveLength(80)
  })

  it("escapes every regex metacharacter", () => {
    const hostile = ".*+?^${}()|[]\\"
    const re = new RegExp(escapeRegex(hostile))
    expect(re.test(hostile)).toBe(true)
    expect(re.test("anything else")).toBe(false)
  })
})
