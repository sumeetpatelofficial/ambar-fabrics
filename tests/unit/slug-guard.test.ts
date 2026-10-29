import { describe, expect, it, vi } from "vitest"
import { createSlugGuard, parseCatalogPath } from "@/lib/slug-guard"

function clock(start = 1_000_000) {
  let t = start
  return { now: () => t, advance: (ms: number) => (t += ms) }
}

describe("parseCatalogPath", () => {
  it.each([
    ["/products/handloom-cotton", { kind: "product", slug: "handloom-cotton" }],
    ["/categories/fabrics", { kind: "category", slug: "fabrics" }],
    ["/collections/navratri-edit/", { kind: "collection", slug: "navratri-edit" }],
    ["/products/caf%C3%A9", { kind: "product", slug: "café" }],
  ])("%s", (path, expected) => {
    expect(parseCatalogPath(path)).toEqual(expected)
  })

  it.each(["/", "/products", "/products/a/b", "/shop", "/api/v1/products/x", "/products/%E0%A4%A"])(
    "ignores %s",
    (path) => {
      expect(parseCatalogPath(path)).toBeNull()
    }
  )
})

describe("createSlugGuard", () => {
  it("looks a slug up once and serves repeats from memory", async () => {
    const lookup = vi.fn().mockResolvedValue(true)
    const guard = createSlugGuard(lookup)
    expect(await guard.exists("product", "a")).toBe(true)
    expect(await guard.exists("product", "a")).toBe(true)
    expect(lookup).toHaveBeenCalledTimes(1)
  })

  it("keeps product, category and collection slugs separate", async () => {
    const lookup = vi.fn(async (kind: string) => kind === "category")
    const guard = createSlugGuard(lookup)
    expect(await guard.exists("category", "x")).toBe(true)
    expect(await guard.exists("product", "x")).toBe(false)
  })

  it("remembers misses briefly, so a flood of random URLs cannot hammer the database", async () => {
    const t = clock()
    const lookup = vi.fn().mockResolvedValue(false)
    const guard = createSlugGuard(lookup, { now: t.now, missTtlMs: 30_000 })
    for (let i = 0; i < 50; i++) expect(await guard.exists("product", "nope")).toBe(false)
    expect(lookup).toHaveBeenCalledTimes(1)
    t.advance(30_001)
    await guard.exists("product", "nope")
    expect(lookup).toHaveBeenCalledTimes(2)
  })

  it("picks up a newly published page once the miss expires", async () => {
    const t = clock()
    let published = false
    const guard = createSlugGuard(async () => published, { now: t.now, missTtlMs: 30_000 })
    expect(await guard.exists("product", "new")).toBe(false)
    published = true
    expect(await guard.exists("product", "new")).toBe(false) // still within the miss window
    t.advance(30_001)
    expect(await guard.exists("product", "new")).toBe(true)
  })

  it("re-checks hits after their TTL, so an unpublished page stops resolving", async () => {
    const t = clock()
    let live = true
    const guard = createSlugGuard(async () => live, { now: t.now, hitTtlMs: 60_000 })
    expect(await guard.exists("product", "p")).toBe(true)
    live = false
    t.advance(60_001)
    expect(await guard.exists("product", "p")).toBe(false)
  })

  it("fails open when the lookup throws, and does not cache the failure", async () => {
    const lookup = vi.fn().mockRejectedValueOnce(new Error("db down")).mockResolvedValue(false)
    const guard = createSlugGuard(lookup)
    expect(await guard.exists("product", "p")).toBe(true) // page renders and handles it itself
    expect(await guard.exists("product", "p")).toBe(false) // next call really checks again
    expect(lookup).toHaveBeenCalledTimes(2)
  })

  it("stays bounded, evicting the oldest entries", async () => {
    const guard = createSlugGuard(async () => true, { maxEntries: 3 })
    for (const s of ["a", "b", "c", "d", "e"]) await guard.exists("product", s)
    expect(guard.size).toBe(3)
  })
})

describe("category addresses", () => {
  it("reads a top-level category and a sub-category under its parent", async () => {
    const { parseCategoryPath } = await import("@/lib/slug-guard")
    expect(parseCategoryPath("/categories/fabrics")).toEqual({ slug: "fabrics" })
    expect(parseCategoryPath("/categories/fabrics/")).toEqual({ slug: "fabrics" })
    expect(parseCategoryPath("/categories/fabrics/modal-silk-fabrics")).toEqual({
      parent: "fabrics",
      slug: "modal-silk-fabrics",
    })
    expect(parseCategoryPath("/categories/fabrics/a/b")).toBeNull() // only one level deep
    expect(parseCategoryPath("/categories")).toBeNull()
    expect(parseCategoryPath("/products/x")).toBeNull()
    expect(parseCategoryPath("/categories/%E0%A4%A")).toBeNull() // a broken escape is left to the page
  })
})
