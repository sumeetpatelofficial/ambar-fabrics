import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { MongoMemoryReplSet } from "mongodb-memory-server"
import mongoose from "mongoose"
import { ROLES, roleHasPermission } from "@/config/permissions"
import { productInputSchema } from "@/features/admin/catalog-schemas"
import { productListQuerySchema, type ProductListQuery } from "@/features/catalog/schemas"
import { ForbiddenError, ValidationError } from "@/lib/errors"
import { Category } from "@/models/category"
import { Product } from "@/models/product"
import { Taxon } from "@/models/taxon"
import {
  categoryProductCounts,
  listCategoriesAdmin,
  reorderCategories,
  saveProduct,
} from "@/services/admin-catalog-service"
import {
  deleteTaxon,
  linkProductsToTaxa,
  listTaxa,
  reorderTaxa,
  saveTaxon,
} from "@/services/admin-taxonomy-service"
import {
  getProductDetail,
  getTaxonPublic,
  listProducts,
  listTaxaPublic,
} from "@/services/catalog-service"
import { getSitemapEntries } from "@/services/seo-service"
import { slugRepository } from "@/repositories/slug-repository"
import { seedSampleCatalog } from "../../scripts/lib/seed-catalog"
import { resetDatabase, startDatabase, stopDatabase } from "./helpers"

vi.mock("server-only", () => ({}))

let replSet: MongoMemoryReplSet
const NOW = new Date("2026-10-14T06:00:00Z")
const oid = () => String(new mongoose.Types.ObjectId())
const owner = { id: oid(), role: "super_admin" as const }
const q = (raw: Record<string, unknown> = {}): ProductListQuery =>
  productListQuerySchema.parse({ pageSize: 60, ...raw })
const names = async (raw: Record<string, unknown>) =>
  (await listProducts(q(raw), NOW))!.items.map((i) => i.name).sort()

beforeAll(async () => {
  replSet = await startDatabase("taxonomy_test")
}, 240_000)
afterAll(() => stopDatabase(replSet))
beforeEach(async () => {
  await resetDatabase()
  await seedSampleCatalog(NOW)
})

describe("one master list of fabrics and prints, used by every kind of product", () => {
  it("the sample catalogue creates them from its products and links every product", async () => {
    const fabrics = (await listTaxa(owner, "fabric")).map((f) => f.name)
    const prints = (await listTaxa(owner, "print")).map((p) => p.name)
    expect(fabrics).toEqual(
      expect.arrayContaining(["Cotton", "Crepe", "Gaji silk", "Modal silk", "Chinon", "Tissue"])
    )
    expect(prints).toEqual(expect.arrayContaining(["Bandhani", "Ajrakh", "Block print", "Floral"]))
    expect(prints).not.toContain("Plain") // plain is no print at all
    const cotton = (await listTaxa(owner, "fabric")).find((f) => f.name === "Cotton")!
    expect(cotton.products).toBeGreaterThan(4)
  })

  it("a fabric is found across categories: cotton dupattas, blouses, kurtis, suits and cloth", async () => {
    const cotton = await names({ fabric: "cotton" })
    expect(cotton).toEqual(
      expect.arrayContaining([
        "Cotton blouse",
        "Cotton kurti",
        "Cotton unstitched suit",
        "Handloom cotton",
        "Block print dupatta",
        "Ajrakh cotton stole",
      ])
    )
    // ...and one filter inside one category narrows it.
    expect(await names({ category: "dupattas", fabric: "cotton" })).toEqual([
      "Ajrakh cotton stole",
      "Block print dupatta",
      "Plain mulmul dupatta",
    ])
  })

  it("a print comes on many fabrics: ajrakh on cotton, modal silk; bandhani on gaji silk and crepe", async () => {
    const ajrakh = await names({ pattern: "ajrakh" })
    expect(ajrakh).toEqual(
      expect.arrayContaining([
        "Ajrakh blouse",
        "Ajrakh cotton stole",
        "Ajrakh dupatta",
        "Ajrakh unstitched suit",
      ])
    )
    const fabricsOfAjrakh = await Product.distinct("attributes.fabricType", {
      "attributes.pattern": "ajrakh",
    })
    expect(fabricsOfAjrakh.sort()).toEqual(["cotton", "modal silk"])
    expect(await names({ category: "dupattas", pattern: "bandhani" })).toEqual([
      "Bandhani dupatta",
      "Gharchola bandhani dupatta",
    ])
    expect(await names({ category: "dupattas", pattern: "bandhani", fabric: "crepe" })).toEqual([
      "Gharchola bandhani dupatta",
    ])
    expect(await names({ pattern: "bandhani", fabric: "gaji silk" })).toEqual([
      "Bandhani blouse",
      "Bandhani dupatta",
      "Bandhani unstitched suit",
    ])
  })

  it("the product page links to its fabric and print", async () => {
    const detail = (await getProductDetail("ajrakh-dupatta", NOW))!
    expect(detail.fabric).toEqual({ name: "Modal silk", slug: "modal-silk" })
    expect(detail.print).toEqual({ name: "Ajrakh", slug: "ajrakh" })
    const plain = (await getProductDetail("plain-mulmul-dupatta", NOW))!
    expect(plain.fabric?.name).toBe("Cotton")
    expect(plain.print).toBeUndefined()
  })

  it("public lists and pages only include shown fabrics and prints", async () => {
    expect((await listTaxaPublic("fabric")).map((f) => f.slug)).toContain("gaji-silk")
    const gaji = (await Taxon.findOne({ kind: "fabric", slug: "gaji-silk" }).lean())!
    await saveTaxon(owner, "fabric", String(gaji._id), { name: "Gaji silk", status: "hidden" })
    expect((await listTaxaPublic("fabric")).map((f) => f.slug)).not.toContain("gaji-silk")
    expect(await getTaxonPublic("fabric", "gaji-silk")).toBeNull()
    expect(await slugRepository.exists("fabric", "gaji-silk")).toBe(false)
    expect(await slugRepository.exists("fabric", "cotton")).toBe(true)
    expect(await slugRepository.exists("print", "cotton")).toBe(false) // the lists are separate
    expect((await getProductDetail("bandhani-dupatta", NOW))!.fabric).toBeUndefined() // hidden: no link
    expect((await getProductDetail("bandhani-dupatta", NOW))!.attributes.fabricType).toBe(
      "gaji silk"
    ) // but the product keeps it
  })

  it("the sitemap lists the pages of shown fabrics and prints", async () => {
    const paths = (await getSitemapEntries(NOW)).map((e) => e.path)
    expect(paths).toEqual(
      expect.arrayContaining(["/fabrics", "/prints", "/fabrics/cotton", "/prints/ajrakh"])
    )
    expect(new Set(paths).size).toBe(paths.length)
  })
})

describe("editing the master lists", () => {
  it("renaming a fabric renames it on every product that uses it, so filters follow", async () => {
    const cotton = (await Taxon.findOne({ kind: "fabric", slug: "cotton" }).lean())!
    const before = (await listTaxa(owner, "fabric")).find(
      (f) => f.id === String(cotton._id)
    )!.products
    const result = await saveTaxon(owner, "fabric", String(cotton._id), {
      name: "Pure cotton",
      slug: "pure-cotton",
      status: "active",
    })
    expect(result.productsUpdated).toBe(before)
    expect((await names({ fabric: "pure cotton" })).length).toBe(before)
    expect(await names({ fabric: "cotton" })).toEqual([])
    expect((await getProductDetail("handloom-cotton", NOW))!.fabric).toEqual({
      name: "Pure cotton",
      slug: "pure-cotton",
    })
  })

  it("names and addresses are unique within a list but a fabric and a print may share a name", async () => {
    await expect(
      saveTaxon(owner, "fabric", null, { name: "cotton", status: "active" })
    ).rejects.toMatchObject({ details: [{ path: "name" }] })
    await expect(
      saveTaxon(owner, "fabric", null, { name: "Ajrakh", status: "active" })
    ).resolves.toBeTruthy() // a print already has this name
    await expect(
      saveTaxon(owner, "fabric", null, { name: "Other", slug: "cotton", status: "active" })
    ).rejects.toMatchObject({ details: [{ path: "slug" }] })
    await expect(
      saveTaxon(owner, "print", null, { name: "x", status: "active" })
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it("creates new ones at the end, and puts them in the order given", async () => {
    const created = await saveTaxon(owner, "fabric", null, {
      name: "gaji silk 2",
      status: "active",
    })
    const list = await listTaxa(owner, "fabric")
    expect(list.at(-1)?.id).toBe(created.id)
    expect(list.at(-1)?.name).toBe("Gaji silk 2")
    const reversed = [...list].reverse().map((f) => f.id)
    await reorderTaxa(owner, "fabric", reversed)
    expect((await listTaxa(owner, "fabric")).map((f) => f.id)).toEqual(reversed)
    expect((await listTaxaPublic("fabric")).map((f) => f.id)).toEqual(reversed)
  })

  it("will not take a partial or stale order", async () => {
    const ids = (await listTaxa(owner, "fabric")).map((f) => f.id)
    await expect(reorderTaxa(owner, "fabric", ids.slice(1))).rejects.toThrow(/changed/i)
    await expect(reorderTaxa(owner, "fabric", [...ids, oid()])).rejects.toThrow(/changed/i)
    await expect(
      reorderTaxa(owner, "fabric", [ids[0]!, ids[0]!, ...ids.slice(2)])
    ).rejects.toThrow()
    await expect(reorderTaxa(owner, "fabric", ["x"])).rejects.toThrow()
    const prints = (await listTaxa(owner, "print")).map((p) => p.id)
    await expect(reorderTaxa(owner, "fabric", prints)).rejects.toThrow() // the other list
  })

  it("deletes only what no product uses", async () => {
    const cotton = (await Taxon.findOne({ kind: "fabric", slug: "cotton" }).lean())!
    await expect(deleteTaxon(owner, String(cotton._id))).rejects.toThrow(/used by \d+ products/)
    const spare = await saveTaxon(owner, "print", null, { name: "Kalamkari", status: "active" })
    await deleteTaxon(owner, spare.id)
    expect(await Taxon.exists({ _id: spare.id })).toBeNull()
  })

  it("is repeatable: linking again changes nothing", async () => {
    const before = [await Taxon.countDocuments(), await Product.countDocuments({ fabricId: null })]
    expect(await linkProductsToTaxa()).toEqual({ created: 0, linked: 0 })
    expect([
      await Taxon.countDocuments(),
      await Product.countDocuments({ fabricId: null }),
    ]).toEqual(before)
  })

  it("only people who may edit the catalogue change the lists", async () => {
    for (const role of ROLES) {
      const actor = { id: oid(), role }
      const write = await saveTaxon(actor, "fabric", null, {
        name: `Fabric ${role}`,
        status: "active",
      }).then(
        () => "ok",
        (e: unknown) => (e instanceof ForbiddenError ? "forbidden" : "other")
      )
      expect(write === "forbidden", `${role} write`).toBe(!roleHasPermission(role, "catalog:write"))
      const read = await listTaxa(actor, "fabric").then(
        () => "ok",
        (e: unknown) => (e instanceof ForbiddenError ? "forbidden" : "other")
      )
      expect(read === "forbidden", `${role} read`).toBe(!roleHasPermission(role, "catalog:read"))
    }
  })
})

describe("choosing them on a product", () => {
  const input = (o: Record<string, string>, categoryId: string) =>
    productInputSchema.parse({
      name: "Silk bandhani dupatta",
      status: "active",
      categoryId,
      returnable: "on",
      ...o,
    })

  it("sets the master fabric and print and keeps the filter names in step", async () => {
    const dupattas = (await Category.findOne({ slug: "dupattas" }).lean())!
    const crepe = (await Taxon.findOne({ kind: "fabric", slug: "crepe" }).lean())!
    const bandhani = (await Taxon.findOne({ kind: "print", slug: "bandhani" }).lean())!
    const saved = await saveProduct(
      owner,
      null,
      input({ fabricId: String(crepe._id), printId: String(bandhani._id) }, String(dupattas._id))
    )
    const p = (await Product.findById(saved.id).lean())!
    expect(p).toMatchObject({ attributes: { fabricType: "crepe", pattern: "bandhani" } })
    expect(String(p.fabricId)).toBe(String(crepe._id))
    // Changing to another fabric moves it, and clearing the print removes it.
    const silk = (await Taxon.findOne({ kind: "fabric", slug: "gaji-silk" }).lean())!
    await saveProduct(owner, saved.id, input({ fabricId: String(silk._id) }, String(dupattas._id)))
    const after = (await Product.findById(saved.id).lean())!
    expect(after.attributes.fabricType).toBe("gaji silk")
    expect(after.attributes.pattern).toBeUndefined()
    expect(after.printId).toBeNull()
  })

  it("refuses an id that is the wrong kind, gone, or not an id", async () => {
    const dupattas = String((await Category.findOne({ slug: "dupattas" }).lean())!._id)
    const bandhani = String((await Taxon.findOne({ kind: "print", slug: "bandhani" }).lean())!._id)
    await expect(
      saveProduct(owner, null, input({ fabricId: bandhani }, dupattas))
    ).rejects.toMatchObject({ details: [{ path: "fabricId" }] }) // a print is not a fabric
    await expect(
      saveProduct(owner, null, input({ printId: oid() }, dupattas))
    ).rejects.toMatchObject({ details: [{ path: "printId" }] })
    expect(() => input({ fabricId: "not-an-id" }, dupattas)).toThrow()
  })
})

describe("arranging categories by dragging", () => {
  async function layoutOf() {
    const all = await listCategoriesAdmin(owner)
    const tops = all.filter((c) => !c.parentId).sort((a, b) => a.sortOrder - b.sortOrder)
    return tops.map((t) => ({
      id: String(t._id),
      children: all
        .filter((c) => String(c.parentId) === String(t._id))
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((c) => String(c._id)),
    }))
  }
  const idOf = async (slug: string) => String((await Category.findOne({ slug }).lean())!._id)

  it("saves a new order of the top-level categories", async () => {
    const layout = await layoutOf()
    const reordered = [...layout].reverse()
    await reorderCategories(owner, reordered)
    expect((await layoutOf()).map((l) => l.id)).toEqual(reordered.map((l) => l.id))
    expect((await layoutOf()).map((l) => l.children)).toEqual(reordered.map((l) => l.children))
  })

  it("moves a sub-category under another parent, and the shop follows", async () => {
    const layout = await layoutOf()
    const cotton = await idOf("cotton-fabrics")
    const dupattas = await idOf("dupattas")
    const moved = layout.map((l) => ({ ...l, children: l.children.filter((c) => c !== cotton) }))
    moved.find((l) => l.id === dupattas)!.children.unshift(cotton)
    await reorderCategories(owner, moved)
    const c = (await Category.findById(cotton).lean())!
    expect([String(c.parentId), c.ancestors.map(String), c.sortOrder]).toEqual([
      dupattas,
      [dupattas],
      1,
    ])
    // Browsing Dupattas now includes everything in Cotton; Fabrics no longer does.
    expect(await names({ category: "dupattas" })).toContain("Handloom cotton")
    expect(await names({ category: "fabrics" })).not.toContain("Handloom cotton")
  })

  it("promotes a sub-category to top level and keeps its products", async () => {
    const layout = await layoutOf()
    const bandhani = await idOf("bandhani-dupattas")
    const next = layout.map((l) => ({ ...l, children: l.children.filter((c) => c !== bandhani) }))
    next.push({ id: bandhani, children: [] })
    const before = await Product.countDocuments({ categoryIds: bandhani })
    await reorderCategories(owner, next)
    const c = (await Category.findById(bandhani).lean())!
    expect(c.parentId).toBeNull()
    expect(c.ancestors).toEqual([])
    expect(await Product.countDocuments({ categoryIds: bandhani })).toBe(before)
    expect((await categoryProductCounts(owner))[bandhani]).toBe(before)
  })

  it("refuses a nest more than one level deep, a repeat, and a stale list; changes nothing", async () => {
    const layout = await layoutOf()
    const snapshot = JSON.stringify(layout)
    const fabrics = await idOf("fabrics")
    const dupattas = await idOf("dupattas")
    const deep = layout
      .filter((l) => l.id !== fabrics)
      .map((l) => (l.id === dupattas ? { ...l, children: [...l.children, fabrics] } : l))
    await expect(reorderCategories(owner, deep)).rejects.toThrow(/sub-categories|changed/)
    await expect(reorderCategories(owner, [...layout, layout[0]!])).rejects.toThrow()
    await expect(reorderCategories(owner, layout.slice(1))).rejects.toThrow(/changed/)
    expect(JSON.stringify(await layoutOf())).toBe(snapshot)
  })

  it("needs permission to edit, and records who did it", async () => {
    const layout = await layoutOf()
    await expect(reorderCategories({ id: oid(), role: "support" }, layout)).rejects.toBeInstanceOf(
      ForbiddenError
    )
    await reorderCategories(owner, layout)
    const { AuditLog } = await import("@/models/audit-log")
    expect(await AuditLog.countDocuments({ action: "category.reordered", actorId: owner.id })).toBe(
      1
    )
  })

  it("two people saving at once leave a valid menu", async () => {
    const layout = await layoutOf()
    const a = [...layout].reverse()
    const b = layout.map((l) => ({ ...l, children: [...l.children].reverse() }))
    await Promise.allSettled([reorderCategories(owner, a), reorderCategories(owner, b)])
    const final = await layoutOf()
    const ids = final.flatMap((l) => [l.id, ...l.children])
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBe(await Category.countDocuments())
  })
})

describe("arranging categories: there and back", () => {
  it("lifting a sub-category to the top and putting it back leaves every category once", async () => {
    const all = async () => listCategoriesAdmin(owner)
    const build = async () => {
      const cats = await all()
      const tops = cats.filter((c) => !c.parentId).sort((a, b) => a.sortOrder - b.sortOrder)
      return tops.map((t) => ({
        id: String(t._id),
        children: cats
          .filter((c) => c.parentId && String(c.parentId) === String(t._id))
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((c) => String(c._id)),
      }))
    }
    const start = await build()
    const parent = start.find((l) => l.children.length > 0)!
    const child = parent.children[0]!
    const { moveItem, ROOT } = await import("@/lib/tree-order")
    const lifted = moveItem(start, child, ROOT, start.length)!
    await reorderCategories(owner, lifted)
    const middle = await build()
    expect(middle.flatMap((l) => [l.id, ...l.children])).toHaveLength(
      new Set(middle.flatMap((l) => [l.id, ...l.children])).size
    )
    const back = moveItem(middle, child, parent.id, 0)!
    await reorderCategories(owner, back)
    const end = await build()
    const ids = end.flatMap((l) => [l.id, ...l.children])
    expect(ids).toHaveLength(new Set(ids).size)
    expect(ids).toHaveLength(await Category.countDocuments())
    expect(end.find((l) => l.id === parent.id)!.children[0]).toBe(child)
  })
})
