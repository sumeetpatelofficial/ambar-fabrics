import { describe, expect, it } from "vitest"
import { findParent, layoutProblem, moveItem, ROOT, type Layout } from "@/lib/tree-order"
import { parseCatalogPath } from "@/lib/slug-guard"

const base = (): Layout => [
  { id: "fabrics", children: ["cotton", "crepe", "chinon"] },
  { id: "dupattas", children: ["bandhani"] },
  { id: "blouses", children: [] },
]

describe("moving categories", () => {
  it("reorders among siblings", () => {
    expect(moveItem(base(), "chinon", "fabrics", 0)?.[0]?.children).toEqual([
      "chinon",
      "cotton",
      "crepe",
    ])
    expect(moveItem(base(), "cotton", "fabrics", 2)?.[0]?.children).toEqual([
      "crepe",
      "chinon",
      "cotton",
    ])
    expect(moveItem(base(), "blouses", ROOT, 0)?.map((l) => l.id)).toEqual([
      "blouses",
      "fabrics",
      "dupattas",
    ])
  })

  it("moves a sub-category to another parent, including an empty one", () => {
    const next = moveItem(base(), "crepe", "dupattas", 0)!
    expect(next.find((l) => l.id === "dupattas")?.children).toEqual(["crepe", "bandhani"])
    expect(next.find((l) => l.id === "fabrics")?.children).toEqual(["cotton", "chinon"])
    expect(
      moveItem(base(), "bandhani", "blouses", 0)?.find((l) => l.id === "blouses")?.children
    ).toEqual(["bandhani"])
  })

  it("promotes a sub-category to top level and demotes a childless one", () => {
    const promoted = moveItem(base(), "cotton", ROOT, 1)!
    expect(promoted.map((l) => l.id)).toEqual(["fabrics", "cotton", "dupattas", "blouses"])
    expect(findParent(promoted, "cotton")).toBe(ROOT)
    const demoted = moveItem(base(), "blouses", "fabrics", 1)!
    expect(demoted.find((l) => l.id === "fabrics")?.children).toEqual([
      "cotton",
      "blouses",
      "crepe",
      "chinon",
    ])
  })

  it("never allows more than one level, or a category inside itself", () => {
    expect(moveItem(base(), "fabrics", "dupattas", 0)).toBeNull() // fabrics has children of its own
    expect(moveItem(base(), "dupattas", "dupattas", 0)).toBeNull()
    expect(moveItem(base(), "cotton", "crepe", 0)).toBeNull() // only top-level categories can hold children
    expect(moveItem(base(), "ghost", ROOT, 0)).toBeNull()
  })

  it("clamps a silly position and never changes its input", () => {
    const input = base()
    const copy = JSON.stringify(input)
    expect(moveItem(input, "cotton", "dupattas", 99)?.[1]?.children).toEqual(["bandhani", "cotton"])
    expect(moveItem(input, "cotton", "dupattas", -5)?.[1]?.children).toEqual(["cotton", "bandhani"])
    expect(JSON.stringify(input)).toBe(copy)
  })

  it("keeps every category exactly once, whatever is moved", () => {
    let layout: Layout = base()
    const ids = ["fabrics", "cotton", "crepe", "chinon", "dupattas", "bandhani", "blouses"]
    for (let i = 0; i < 200; i++) {
      const id = ids[(i * 7) % ids.length]!
      const to = [ROOT, "fabrics", "dupattas", "blouses"][(i * 3) % 4]!
      layout = moveItem(layout, id, to, i % 4) ?? layout
      expect(layoutProblem(layout, ids)).toBeNull()
    }
  })
})

describe("checking a layout", () => {
  const ids = ["fabrics", "cotton", "crepe", "chinon", "dupattas", "bandhani", "blouses"]
  it("accepts exactly what exists", () => expect(layoutProblem(base(), ids)).toBeNull())
  it("refuses duplicates, a parent used as a child, and a list that is out of date", () => {
    expect(
      layoutProblem([{ id: "fabrics", children: ["cotton", "cotton"] }, ...base().slice(1)], ids)
    ).toMatch(/twice/)
    expect(
      layoutProblem(
        [
          { id: "fabrics", children: ["dupattas"] },
          { id: "dupattas", children: [] },
        ],
        ["fabrics", "dupattas"]
      )
    ).toMatch(/sub-categories/)
    expect(layoutProblem(base().slice(1), ids)).toMatch(/changed/)
    expect(layoutProblem(base(), [...ids, "brand-new"])).toMatch(/changed/)
  })
})

describe("fabric and print addresses", () => {
  it("are recognised by the 404 guard", () => {
    expect(parseCatalogPath("/fabrics/gaji-silk")).toEqual({ kind: "fabric", slug: "gaji-silk" })
    expect(parseCatalogPath("/prints/ajrakh")).toEqual({ kind: "print", slug: "ajrakh" })
    expect(parseCatalogPath("/fabrics")).toBeNull()
    expect(parseCatalogPath("/prints/a/b")).toBeNull()
  })
})
