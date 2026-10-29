// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest"
import { BAG_LINE_LIMIT, sanitizeBag, useBag } from "@/stores/bag-store"
import { sanitizeWishlist, useWishlist, WISHLIST_LIMIT } from "@/stores/wishlist-store"

const id = (n: number) => n.toString(16).padStart(24, "0")

describe("sanitizeWishlist", () => {
  it("keeps valid unique slugs and drops everything else", () => {
    expect(
      sanitizeWishlist(["a-b", "a-b", "Bad Slug", 5, null, { x: 1 }, "<script>", "ok"])
    ).toEqual(["a-b", "ok"])
  })

  it("survives non-arrays and caps the length", () => {
    for (const bad of [undefined, null, "x", 7, { length: 3 }])
      expect(sanitizeWishlist(bad)).toEqual([])
    const many = Array.from({ length: 500 }, (_, i) => `item-${i}`)
    expect(sanitizeWishlist(many)).toHaveLength(WISHLIST_LIMIT)
  })
})

describe("sanitizeBag", () => {
  it("keeps well-formed lines and merges duplicates", () => {
    expect(
      sanitizeBag([
        { variantId: id(1), qty: 500 },
        { variantId: id(1), qty: 1000 },
        { variantId: id(2), qty: 1 },
      ])
    ).toEqual([
      { variantId: id(1), qty: 1500 },
      { variantId: id(2), qty: 1 },
    ])
  })

  it.each([
    [{ variantId: "nope", qty: 1 }],
    [{ variantId: id(1), qty: 0 }],
    [{ variantId: id(1), qty: -5 }],
    [{ variantId: id(1), qty: 1.5 }],
    [{ variantId: id(1), qty: "3" }],
    [{ variantId: id(1), qty: Number.MAX_SAFE_INTEGER + 2 }],
    [null],
    ["x"],
  ])("drops %j", (line) => {
    expect(sanitizeBag([line])).toEqual([])
  })

  it("caps the number of lines and tolerates non-arrays", () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ variantId: id(i), qty: 1 }))
    expect(sanitizeBag(many)).toHaveLength(BAG_LINE_LIMIT)
    expect(sanitizeBag({ not: "an array" })).toEqual([])
  })
})

describe("useWishlist", () => {
  beforeEach(() => {
    localStorage.clear()
    useWishlist.setState({ slugs: [], owner: null, hydrated: false })
  })

  it("toggles on and off and reports the new state", () => {
    expect(useWishlist.getState().toggle("cotton")).toBe(true)
    expect(useWishlist.getState().slugs).toEqual(["cotton"])
    expect(useWishlist.getState().toggle("cotton")).toBe(false)
    expect(useWishlist.getState().slugs).toEqual([])
  })

  it("puts the newest first", () => {
    useWishlist.getState().toggle("a")
    useWishlist.getState().toggle("b")
    expect(useWishlist.getState().slugs).toEqual(["b", "a"])
  })

  it("loads saved data after rehydrate and ignores tampered storage", async () => {
    localStorage.setItem(
      "af-wishlist",
      JSON.stringify({ state: { slugs: ["good-one", "../../etc", 5] }, version: 1 })
    )
    await useWishlist.persist.rehydrate()
    expect(useWishlist.getState().slugs).toEqual(["good-one"])
    expect(useWishlist.getState().hydrated).toBe(true)
  })

  it("remembers whose list it is, forgets that on clear, and distrusts a tampered owner", async () => {
    const owner = "a".repeat(24)
    useWishlist.getState().toggle("cotton")
    useWishlist.getState().setOwner(owner)
    expect(JSON.parse(localStorage.getItem("af-wishlist")!).state).toEqual({
      slugs: ["cotton"],
      owner,
    })
    useWishlist.getState().clear()
    expect(useWishlist.getState()).toMatchObject({ slugs: [], owner: null })

    localStorage.setItem(
      "af-wishlist",
      JSON.stringify({ state: { slugs: ["cotton"], owner: { $ne: null } }, version: 1 })
    )
    await useWishlist.persist.rehydrate()
    expect(useWishlist.getState().owner).toBeNull()
    localStorage.setItem(
      "af-wishlist",
      JSON.stringify({ state: { slugs: [], owner: "not-an-id" }, version: 1 })
    )
    await useWishlist.persist.rehydrate()
    expect(useWishlist.getState().owner).toBeNull()
  })

  it("does not throw when storage holds garbage", async () => {
    localStorage.setItem("af-wishlist", "{not json")
    await expect(useWishlist.persist.rehydrate()).resolves.not.toThrow()
    expect(useWishlist.getState().slugs).toEqual([])
  })
})

describe("useBag (account mirror)", () => {
  beforeEach(() => useBag.setState({ lines: [], owner: null, synced: false }))

  it("sets an exact quantity and ignores invalid ones", () => {
    useBag.getState().add(id(1), 1000)
    useBag.getState().setQty(id(1), 2500)
    useBag.getState().setQty(id(1), 0)
    useBag.getState().setQty(id(1), 1.5)
    expect(useBag.getState().lines).toEqual([{ variantId: id(1), qty: 2500 }])
  })

  it("replaces its lines with the server's, dropping anything malformed", () => {
    useBag.getState().add(id(1), 1000)
    useBag.getState().replace([
      { variantId: id(2), qty: 500 },
      { variantId: "junk", qty: 5 },
    ])
    expect(useBag.getState().lines).toEqual([{ variantId: id(2), qty: 500 }])
  })

  it("clearing also forgets whose bag it was", () => {
    useBag.setState({ lines: [{ variantId: id(1), qty: 1 }], owner: id(9) })
    useBag.getState().clear()
    expect(useBag.getState()).toMatchObject({ lines: [], owner: null })
  })
})

describe("useBag", () => {
  beforeEach(() => {
    localStorage.clear()
    useBag.setState({ lines: [], hydrated: false, owner: null, synced: false })
  })

  it("adds, merges the same variant, and removes", () => {
    useBag.getState().add(id(1), 2500)
    useBag.getState().add(id(1), 500)
    useBag.getState().add(id(2), 1)
    expect(useBag.getState().lines).toEqual([
      { variantId: id(1), qty: 3000 },
      { variantId: id(2), qty: 1 },
    ])
    expect(useBag.getState().qtyOf(id(1))).toBe(3000)
    expect(useBag.getState().qtyOf(id(9))).toBe(0)
    useBag.getState().remove(id(1))
    expect(useBag.getState().lines).toEqual([{ variantId: id(2), qty: 1 }])
  })

  it("refuses invalid input", () => {
    useBag.getState().add("bad-id", 1)
    useBag.getState().add(id(1), 0)
    useBag.getState().add(id(1), 1.5)
    useBag.getState().add(id(1), -1)
    expect(useBag.getState().lines).toEqual([])
  })

  it("stops adding new lines at the limit but still merges into existing ones", () => {
    for (let i = 0; i < BAG_LINE_LIMIT + 5; i++) useBag.getState().add(id(i), 1)
    expect(useBag.getState().lines).toHaveLength(BAG_LINE_LIMIT)
    useBag.getState().add(id(0), 4)
    expect(useBag.getState().qtyOf(id(0))).toBe(5)
  })

  it("persists and restores, discarding tampered lines", async () => {
    useBag.getState().add(id(3), 1000)
    expect(localStorage.getItem("af-bag")).toContain(id(3))

    useBag.setState({ lines: [], hydrated: false }) // (the store saves on every change...)
    localStorage.setItem(
      // ...so plant the tampered value afterwards, as someone editing storage by hand would
      "af-bag",
      JSON.stringify({
        state: {
          lines: [
            { variantId: id(3), qty: 1000 },
            { variantId: "x", qty: 9 },
            { variantId: id(4), qty: -1 },
          ],
        },
        version: 1,
      })
    )
    await useBag.persist.rehydrate()
    expect(useBag.getState().lines).toEqual([{ variantId: id(3), qty: 1000 }])
  })
})
