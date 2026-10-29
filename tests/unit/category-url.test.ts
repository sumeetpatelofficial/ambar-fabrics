import { describe, expect, it } from "vitest"
import { breadcrumbLinks, categoryHref } from "@/lib/category-url"

describe("category addresses", () => {
  it("puts a sub-category under its parent", () => {
    expect(categoryHref("fabrics")).toBe("/categories/fabrics")
    expect(categoryHref("fabrics", null)).toBe("/categories/fabrics")
    expect(categoryHref("modal-silk-fabrics", "fabrics")).toBe(
      "/categories/fabrics/modal-silk-fabrics"
    )
  })

  it("gives every breadcrumb the address of the path so far", () => {
    expect(
      breadcrumbLinks([
        { name: "Fabrics", slug: "fabrics" },
        { name: "Cotton", slug: "cotton-fabrics" },
      ])
    ).toEqual([
      { name: "Fabrics", slug: "fabrics", href: "/categories/fabrics" },
      { name: "Cotton", slug: "cotton-fabrics", href: "/categories/fabrics/cotton-fabrics" },
    ])
    expect(breadcrumbLinks([])).toEqual([])
  })
})
