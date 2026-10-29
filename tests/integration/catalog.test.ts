import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { MongoMemoryReplSet } from "mongodb-memory-server"
import mongoose from "mongoose"
import { units } from "@/lib/measure"
import { productListQuerySchema, type ProductListQuery } from "@/features/catalog/schemas"
import { connectDb } from "@/lib/db/mongoose"
import { Category } from "@/models/category"
import { Collection } from "@/models/collection"
import { Product } from "@/models/product"
import { ProductVariant } from "@/models/product-variant"
import * as service from "@/services/catalog-service"
import { buildListQuery } from "@/repositories/product-repository"
import { seedSampleCatalog } from "../../scripts/lib/seed-catalog"
import { buildSampleProducts } from "../../scripts/lib/sample-catalog"

/**
 * End-to-end catalogue behaviour against a real mongod: seeding, listing, filters, sorting, search,
 * facets, detail, collections, validation rules and index usage. Uses the deterministic sample catalogue.
 */
let replSet: MongoMemoryReplSet
let seeded: { products: number; variants: number }
const NOW = new Date("2026-10-14T06:00:00Z")

const q = (raw: Record<string, unknown> = {}): ProductListQuery => productListQuerySchema.parse(raw)

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } })
  vi.stubEnv("MONGODB_URI", replSet.getUri("catalog_test"))
  await connectDb()
  await Promise.all([Category, Collection, Product, ProductVariant].map((m) => m.init())) // build indexes first
  seeded = await seedSampleCatalog(NOW)
}, 240_000)

afterAll(async () => {
  await mongoose.disconnect()
  await replSet?.stop()
  vi.unstubAllEnvs()
})

async function names(query: Partial<Record<string, unknown>>) {
  const result = await service.listProducts(q({ pageSize: 60, ...query }), NOW)
  expect(result).not.toBeNull()
  return result!.items.map((i) => i.name)
}

describe("seeding", () => {
  it("creates the sample catalogue through the real validators", async () => {
    expect(seeded.products).toBe(buildSampleProducts().length)
    expect(seeded.variants).toBeGreaterThan(seeded.products)
  })

  it("stores card summaries on each product", async () => {
    const cotton = await Product.findOne({ slug: "handloom-cotton" }).lean()
    expect(cotton?.priceRange).toMatchObject({ minPaise: 18000, maxPaise: 18000 })
    expect(cotton?.priceUnitLabel).toBe("per metre")
    expect(cotton?.inStock).toBe(true)
    expect(cotton?.swatches.map((s) => s.name)).toEqual(["Sage", "Sand", "Indigo"])
    expect(cotton?.variantCount).toBe(3)
  })

  it("marks products with no stock as sold out", async () => {
    const chinon = await Product.findOne({ slug: "chinon" }).lean()
    expect(chinon?.inStock).toBe(false)
  })
})

describe("listProducts: pagination", () => {
  it("returns consistent totals and non-overlapping pages", async () => {
    const page1 = await service.listProducts(q({ pageSize: 10, page: 1, sort: "newest" }), NOW)
    const page2 = await service.listProducts(q({ pageSize: 10, page: 2, sort: "newest" }), NOW)
    expect(page1!.total).toBe(seeded.products)
    expect(page1!.totalPages).toBe(Math.ceil(seeded.products / 10))
    expect(page1!.items).toHaveLength(10)
    const ids1 = new Set(page1!.items.map((i) => i.id))
    expect(page2!.items.every((i) => !ids1.has(i.id))).toBe(true)
  })

  it("returns an empty page, not an error, past the end", async () => {
    const past = await service.listProducts(q({ pageSize: 10, page: 50 }), NOW)
    expect(past!.items).toEqual([])
    expect(past!.total).toBe(seeded.products)
  })

  it("orders newest first", async () => {
    const all = await names({ sort: "newest" })
    expect(all[0]).toBe("Gharchola bandhani dupatta") // published 3 days ago
  })
})

describe("listProducts: categories and collections", () => {
  it("a parent category includes products from its children", async () => {
    const fabrics = await names({ category: "fabrics" })
    expect(fabrics).toEqual(expect.arrayContaining(["Handloom cotton", "Chinon", "Tassel latkan"]))
    expect(fabrics).not.toContain("Bandhani dupatta")
  })

  it("a leaf category lists only its own products", async () => {
    expect(await names({ category: "cotton-fabrics", sort: "price_asc" })).toEqual([
      "Mulmul cotton",
      "Handloom cotton",
      "Block print cotton",
    ])
  })

  it("returns null for an unknown category so the route can answer 404", async () => {
    expect(await service.listProducts(q({ category: "nope" }), NOW)).toBeNull()
  })

  it("includes category details and breadcrumbs for the page header", async () => {
    const result = await service.listProducts(q({ category: "cotton-fabrics" }), NOW)
    expect(result!.category?.breadcrumbs.map((b) => b.name)).toEqual(["Fabrics", "Cotton"])
    const parent = await service.listProducts(q({ category: "fabrics" }), NOW)
    expect(parent!.category?.children.map((c) => c.name)).toContain("Cotton")
  })

  it("lists a manual collection's products", async () => {
    const result = await service.listProducts(q({ collection: "navratri-edit" }), NOW)
    expect(result!.collection?.name).toBe("Navratri edit")
    expect(result!.items.map((i) => i.name)).toEqual(
      expect.arrayContaining(["Modal silk", "Tissue fabric", "Bandhani dupatta", "Ajrakh dupatta"])
    )
    expect(
      result!.items.every((i) =>
        [
          "Modal silk",
          "Ajrakh print modal silk",
          "Tissue fabric",
          "Bandhani dupatta",
          "Gharchola bandhani dupatta",
          "Ajrakh dupatta",
        ].includes(i.name)
      )
    ).toBe(true)
  })

  it("resolves smart collections by tag and by category", async () => {
    const cottons = await service.listProducts(q({ collection: "everyday-cottons" }), NOW)
    expect(cottons!.items.map((i) => i.name).sort()).toEqual([
      "Block print cotton",
      "Handloom cotton",
      "Mulmul cotton",
    ])
    const tissue = await service.listProducts(q({ collection: "festive-tissue" }), NOW)
    expect(tissue!.items.map((i) => i.name)).toEqual(["Tissue fabric"])
  })

  it("hides collections outside their visibility window", async () => {
    await Collection.create({
      name: "Diwali",
      slug: "diwali-2025",
      startsAt: new Date("2025-10-01"),
      endsAt: new Date("2025-11-15"),
    })
    await Collection.create({ name: "Holi", slug: "holi-2027", startsAt: new Date("2027-03-01") })
    expect(await service.getCollection("diwali-2025", NOW)).toBeNull()
    expect(await service.getCollection("holi-2027", NOW)).toBeNull()
    expect(await service.getCollection("navratri-edit", NOW)).not.toBeNull()
  })
})

describe("listProducts: filters", () => {
  it("filters by fabric type, colour family and pattern", async () => {
    // A fabric is one master list across categories: chinon cloth, a chinon dupatta, a chinon kurti...
    expect((await names({ fabric: "chinon" })).sort()).toEqual([
      "Anarkali kurti",
      "Chinon",
      "Dyed chinon dupatta",
      "Floral print dupatta",
    ])
    expect(await names({ category: "fabrics", fabric: "chinon" })).toEqual(["Chinon"])
    const bandhani = await names({ pattern: "bandhani" })
    expect(bandhani).toEqual(
      expect.arrayContaining(["Bandhani dupatta", "Bandhani blouse", "Bandhani unstitched suit"])
    )
    expect(await names({ category: "fabrics", color: "blue" })).toEqual(
      expect.arrayContaining(["Handloom cotton", "Printed crepe", "Ajrakh print modal silk"])
    )
  })

  it("combines several values for one filter as OR and different filters as AND", async () => {
    const either = await names({ fabric: ["chinon", "tissue"] })
    expect(either.sort()).toEqual([
      "Anarkali kurti",
      "Chinon",
      "Dyed chinon dupatta",
      "Floral print dupatta",
      "Tissue blouse",
      "Tissue fabric",
    ])
    expect(
      await names({ category: "fabrics", fabric: ["chinon", "tissue"], color: "yellow" })
    ).toEqual(["Tissue fabric"])
  })

  it("filters by price when any variant price falls in the range", async () => {
    const cheap = await names({ category: "fabrics", maxPrice: 150 })
    expect(cheap).toEqual(expect.arrayContaining(["Mulmul cotton", "Lace border", "Tassel latkan"]))
    expect(cheap).not.toContain("Modal silk")
    const mid = await names({ category: "fabrics", minPrice: 200, maxPrice: 300 })
    expect(mid).toEqual(expect.arrayContaining(["Block print cotton", "Printed crepe", "Chinon"]))
  })

  it("uses the sale price, not the regular price, when a sale is running", async () => {
    // Block print cotton is Rs 260 regular, Rs 220 on sale: it must match "under Rs 230".
    expect(await names({ category: "cotton-fabrics", maxPrice: 230 })).toContain(
      "Block print cotton"
    )
  })

  it("hides sold-out products when asked for in-stock only", async () => {
    expect(await names({ category: "chinon-fabrics" })).toEqual(["Chinon"])
    expect(await names({ category: "chinon-fabrics", availability: "in_stock" })).toEqual([])
  })

  it("ignores nothing: a hostile value stays a harmless string", async () => {
    expect(await names({ fabric: "$ne" })).toEqual([])
    expect(await names({ pattern: '{"$gt":""}' })).toEqual([])
  })
})

describe("listProducts: sorting", () => {
  it("sorts by price both ways", async () => {
    const asc = (await service.listProducts(
      q({ category: "fabrics", sort: "price_asc", pageSize: 60 }),
      NOW
    ))!.items
    const desc = (await service.listProducts(
      q({ category: "fabrics", sort: "price_desc", pageSize: 60 }),
      NOW
    ))!.items
    expect(asc.map((i) => i.pricePaise)).toEqual(
      [...asc.map((i) => i.pricePaise)].sort((a, b) => a - b)
    )
    expect(desc.map((i) => i.priceMaxPaise)).toEqual(
      [...desc.map((i) => i.priceMaxPaise)].sort((a, b) => b - a)
    )
    expect(asc[0]!.name).toBe("Lace border") // Rs 35 per metre
  })

  it("sorts by popularity", async () => {
    const popular = await names({ sort: "popular" })
    expect(popular[0]).toBe("Handloom cotton") // soldCount 120
  })
})

describe("listProducts: search", () => {
  it("matches names, tags, keywords and attributes", async () => {
    expect(await names({ q: "bandhani" })).toEqual(
      expect.arrayContaining(["Bandhani dupatta", "Gharchola bandhani dupatta"])
    )
    expect(await names({ q: "khadi" })).toEqual(["Handloom cotton"]) // keyword only
    expect(await names({ q: "chinon" })).toContain("Chinon")
    expect(await names({ q: "navratri" })).toEqual(
      expect.arrayContaining(["Modal silk", "Bandhani dupatta"])
    )
  })

  it("returns every product that mentions the term and no others", async () => {
    const result = await names({ q: "ajrakh", sort: "relevance" })
    expect(result.sort()).toEqual([
      "Ajrakh blouse",
      "Ajrakh cotton stole",
      "Ajrakh dupatta",
      "Ajrakh print modal silk",
      "Ajrakh unstitched suit",
    ])
  })

  it("ranks a keyword-only match below a product whose name matches", async () => {
    // "Khadi" appears only as a search keyword on Handloom cotton; "cotton" is in many names.
    const result = await names({ q: "khadi cotton", sort: "relevance" })
    expect(result[0]).toBe("Handloom cotton") // matches both terms, so it scores highest
  })

  it("finds a product by its exact SKU, ignoring case", async () => {
    expect(await names({ q: "demo-001-sage" })).toEqual(["Handloom cotton"])
  })

  it("returns nothing, not an error, for no match", async () => {
    expect(await names({ q: "zzzzqqq" })).toEqual([])
  })

  it("treats search syntax as plain words", async () => {
    expect(await names({ q: "-cotton" })).toEqual(await names({ q: "cotton" }))
    expect(await names({ q: '"bandhani" dupatta' })).toEqual(
      expect.arrayContaining(["Bandhani dupatta"])
    )
  })

  it("combines search with filters", async () => {
    // The suit's description mentions "dupatta" (it is a three-piece set), so it is a genuine match.
    expect(await names({ q: "dupatta", pattern: "ajrakh" }).then((n) => n.sort())).toEqual([
      "Ajrakh dupatta",
      "Ajrakh unstitched suit",
    ])
  })
})

describe("facets", () => {
  it("counts options within the current scope", async () => {
    const r = await service.listProducts(q({ category: "fabrics" }), NOW)
    const fabric = Object.fromEntries(r!.facets.fabric.map((f) => [f.value, f.count]))
    expect(fabric).toMatchObject({ cotton: 3, crepe: 2, "modal silk": 2, tissue: 1, chinon: 1 })
    expect(r!.facets.price).toEqual({ minPaise: 3500, maxPaise: 45000 })
  })

  it("keeps the other options of a selected filter visible", async () => {
    const r = await service.listProducts(q({ category: "fabrics", fabric: "cotton" }), NOW)
    const values = r!.facets.fabric.map((f) => f.value)
    expect(values).toEqual(expect.arrayContaining(["cotton", "crepe", "chinon"])) // not collapsed to cotton only
    expect(r!.items.every((i) => i.fabricType === "cotton")).toBe(true)
  })

  it("narrows other facets by the active filters", async () => {
    const r = await service.listProducts(q({ category: "fabrics", fabric: "cotton" }), NOW)
    const colours = r!.facets.color.map((f) => f.value)
    expect(colours).not.toContain("purple") // plum belongs to crepe, not cotton
  })

  it("does not apply the price filter to the price bounds", async () => {
    const r = await service.listProducts(q({ category: "fabrics", maxPrice: 100 }), NOW)
    expect(r!.facets.price!.maxPaise).toBeGreaterThan(10000)
  })
})

describe("product detail", () => {
  it("returns variants with effective prices, units and availability, and no raw stock", async () => {
    const d = await service.getProductDetail("block-print-cotton", NOW)
    expect(d).not.toBeNull()
    expect(d!.variants).toHaveLength(2)
    const v = d!.variants[0]!
    expect(v).toMatchObject({ pricePaise: 22000, comparePaise: 26000, unitLabel: "per metre" })
    expect(v.unit).toMatchObject({ kind: "length", minQty: 500, stepQty: 500 })
    expect(v.availability.status).toBe("in_stock")
    expect(JSON.stringify(d)).not.toMatch(/onHand|reserved|"stock"/)
    expect(d!.badge).toBe("Sale")
    expect(d!.breadcrumbs.map((b) => b.name)).toEqual(["Fabrics", "Cotton"])
  })

  it("shows low-stock wording and out-of-stock honestly", async () => {
    const tissue = await service.getProductDetail("tissue-fabric", NOW)
    const gold = tissue!.variants.find((v) => v.colorName === "Antique gold")!
    expect(gold.availability).toMatchObject({
      status: "low_stock",
      label: "Only 4 m left",
      maxOrderable: 4000,
    })
    const chinon = await service.getProductDetail("chinon", NOW)
    expect(chinon!.variants.every((v) => v.availability.status === "out_of_stock")).toBe(true)
    expect(chinon!.soldOut).toBe(true)
  })

  it("returns the regular price once a sale has ended", async () => {
    const later = new Date(NOW.getTime() + 30 * 86_400_000)
    const d = await service.getProductDetail("block-print-cotton", later)
    expect(d!.variants[0]).toMatchObject({ pricePaise: 26000 })
    expect(d!.variants[0]!.comparePaise).toBeUndefined()
  })

  it("is null for unknown, draft and archived products, and products with no active variants", async () => {
    expect(await service.getProductDetail("does-not-exist", NOW)).toBeNull()
    await Product.updateOne({ slug: "plain-crepe" }, { status: "draft" })
    expect(await service.getProductDetail("plain-crepe", NOW)).toBeNull()
    expect(await names({ q: "plain crepe" })).not.toContain("Plain crepe")
    await Product.updateOne({ slug: "plain-crepe" }, { status: "archived" })
    expect(await service.getProductDetail("plain-crepe", NOW)).toBeNull()
    await Product.updateOne({ slug: "plain-crepe" }, { status: "active" })
    const doc = await Product.findOne({ slug: "plain-crepe" })
    await ProductVariant.updateMany({ productId: doc!._id }, { status: "inactive" })
    expect(await service.getProductDetail("plain-crepe", NOW)).toBeNull()
    await ProductVariant.updateMany({ productId: doc!._id }, { status: "active" })
    expect(await service.getProductDetail("plain-crepe", NOW)).not.toBeNull()
  })

  it("lists related products from the same category without the product itself", async () => {
    const related = await service.getRelatedProducts("handloom-cotton", 8, NOW)
    expect(related!.map((p) => p.name).sort()).toEqual(["Block print cotton", "Mulmul cotton"])
    expect(await service.getRelatedProducts("nope", 8, NOW)).toBeNull()
  })
})

describe("suggest, category tree and settings", () => {
  it("suggests products and categories by word prefix", async () => {
    const s = await service.suggest("ban", NOW)
    expect(s.products.map((p) => p.name)).toEqual(expect.arrayContaining(["Bandhani dupatta"]))
    expect(s.categories.map((c) => c.name)).toContain("Bandhani")
    expect(s.products[0]).toMatchObject({
      unitLabel: expect.any(String),
      pricePaise: expect.any(Number),
    })
  })

  it("treats regex characters in the term literally", async () => {
    expect(await service.suggest(".*", NOW)).toEqual({ products: [], categories: [] })
    expect(await service.suggest("(", NOW)).toEqual({ products: [], categories: [] })
  })

  it("builds the category tree", async () => {
    const tree = await service.getCategoryTree()
    expect(tree.map((c) => c.name)).toEqual([
      "Fabrics",
      "Dupattas",
      "Blouses",
      "Ready-made",
      "Unstitched suits",
    ])
    expect(tree[0]!.children.map((c) => c.name)).toEqual([
      "Cotton",
      "Crepe",
      "Modal silk",
      "Chinon",
      "Tissue",
      "Lace and borders",
      "Latkan and tassels",
    ])
    expect(tree[2]!.children).toEqual([])
  })

  it("returns safe public settings with tax off by default", async () => {
    const s = await service.getPublicSettings()
    expect(s).toMatchObject({ storeName: "Ambar", currency: "INR", taxEnabled: false })
  })
})

describe("model validation", () => {
  const base = () => ({
    productId: new mongoose.Types.ObjectId(),
    sku: "TEST-1",
    sellingUnit: units.perMetre(),
    pricePaise: 18000,
    stock: { onHand: 1000, reserved: 0 },
  })

  it("accepts a valid variant", async () => {
    await expect(new ProductVariant(base()).validate()).resolves.toBeUndefined()
  })

  it.each([
    ["an inconsistent selling unit", { sellingUnit: { ...base().sellingUnit, minQty: 750 } }],
    ["a fractional price", { pricePaise: 180.5 }],
    ["a negative price", { pricePaise: -1 }],
    ["reserved above on-hand stock", { stock: { onHand: 5, reserved: 6 } }],
    ["a sale price at or above the price", { salePricePaise: 18000 }],
    ["a compare-at price at or below the price", { compareAtPaise: 18000 }],
    [
      "a sale that ends before it starts",
      {
        salePricePaise: 100,
        saleStartsAt: new Date("2026-02-01"),
        saleEndsAt: new Date("2026-01-01"),
      },
    ],
    ["a malformed SKU", { sku: "bad sku!" }],
  ])("rejects %s", async (_label, patch) => {
    await expect(new ProductVariant({ ...base(), ...patch }).validate()).rejects.toThrow()
  })

  it("rejects bad slugs and requires image alt text", async () => {
    await expect(new Product({ name: "X", slug: "Bad Slug" }).validate()).rejects.toThrow(/slug/)
    await expect(
      new Product({
        name: "X",
        slug: "x",
        images: [{ url: "https://x/y.jpg", alt: "", sortOrder: 0 }],
      }).validate()
    ).rejects.toThrow(/alt/)
  })

  it("enforces unique slugs and SKUs in the database", async () => {
    await expect(Product.create({ name: "Dup", slug: "handloom-cotton" })).rejects.toThrow(
      /duplicate key/i
    )
    const first = await Product.findOne({ slug: "handloom-cotton" })
    await expect(
      ProductVariant.create({ ...base(), productId: first!._id, sku: "demo-001-sage" })
    ).rejects.toThrow(/duplicate key/i)
  })
})

describe("indexes", () => {
  const plan = async (query: { explain: (v: string) => Promise<unknown> }) =>
    JSON.stringify(
      ((await query.explain("queryPlanner")) as { queryPlanner: { winningPlan: unknown } })
        .queryPlanner.winningPlan
    )

  it("uses an index for slug lookup, listing, filters and text search (never a collection scan)", async () => {
    const category = await Category.findOne({ slug: "cotton-fabrics" }).lean()

    const cases: Record<string, { explain: (v: string) => Promise<unknown> }> = {
      "slug lookup": Product.findOne({ slug: "handloom-cotton", status: "active" }),
      "category listing, newest": Product.find(
        buildListQuery({
          categoryIds: [category!._id],
          fabric: [],
          color: [],
          pattern: [],
          sort: "newest",
          page: 1,
          pageSize: 24,
        }).filter
      ).sort({ publishedAt: -1, _id: 1 }),
      bestsellers: Product.find({ status: "active", "flags.bestseller": true }).sort({
        soldCount: -1,
      }),
      "text search": Product.find(
        buildListQuery({
          q: "bandhani",
          fabric: [],
          color: [],
          pattern: [],
          sort: "relevance",
          page: 1,
          pageSize: 24,
        }).filter
      ),
      "sku lookup": ProductVariant.find({ sku: "DEMO-001-SAGE" }),
      "variants of a product": ProductVariant.find({
        productId: category!._id,
        status: "active",
      }),
    }
    for (const [label, query] of Object.entries(cases)) {
      const winning = await plan(query)
      expect(winning, label).not.toContain("COLLSCAN")
      expect(winning, label).toMatch(/IXSCAN|TEXT/)
    }
  })
})

describe("curated lists and lookups (Phase 4)", () => {
  it("filters by flag", async () => {
    expect(await names({ flag: "newArrival" })).toEqual(
      expect.arrayContaining([
        "Gharchola bandhani dupatta",
        "Ajrakh print modal silk",
        "Block print cotton",
        "Tissue blouse",
      ])
    )
    expect((await names({ flag: "bestseller", sort: "popular" }))[0]).toBe("Handloom cotton")
    expect(await names({ flag: "featured" })).toContain("Handloom cotton")
  })

  it("lists only products whose cheapest variant is discounted when on sale", async () => {
    expect((await names({ onSale: "true" })).sort()).toEqual([
      "Bandhani dupatta",
      "Block print cotton",
      "Plain mulmul dupatta",
    ])
  })

  it("an ended sale no longer counts as on sale in new summaries", async () => {
    const later = new Date(NOW.getTime() + 60 * 86_400_000)
    const { refreshProductSummary } = service
    const doc = await Product.findOne({ slug: "block-print-cotton" })
    await refreshProductSummary(doc!._id, later)
    expect(await names({ onSale: "true" })).not.toContain("Block print cotton")
    await refreshProductSummary(doc!._id, NOW) // restore for the tests that follow
    expect(await names({ onSale: "true" })).toContain("Block print cotton")
  })

  it("looks up specific products by slug, ignoring unknown and unpublished ones", async () => {
    const found = await names({
      slugs: ["handloom-cotton", "chinon", "no-such-product", "../etc"],
    }).catch(() => null)
    // an invalid slug makes the whole query invalid (422 at the API), so the schema parse above rejects it
    expect(found).toBeNull()
    expect(
      (await names({ slugs: ["handloom-cotton", "chinon", "no-such-product"] })).sort()
    ).toEqual(["Chinon", "Handloom cotton"])
    expect(await names({ slugs: ["no-such-product"] })).toEqual([])
  })

  it("combines a flag with filters and a category", async () => {
    expect(await names({ flag: "newArrival", category: "fabrics" })).toEqual(
      expect.arrayContaining(["Ajrakh print modal silk", "Block print cotton"])
    )
    expect(await names({ flag: "newArrival", category: "fabrics", fabric: "cotton" })).toEqual([
      "Block print cotton",
    ])
  })

  it("labels variants by colour and size, so four sizes of one colour stay distinguishable", async () => {
    const d = await service.getProductDetail("cotton-blouse", NOW)
    expect(d!.variants.map((v) => v.label)).toEqual(["Sage, S", "Sage, M", "Sage, L", "Sage, XL"])
    expect(d!.variants.map((v) => v.size)).toEqual(["S", "M", "L", "XL"])
    const fabric = await service.getProductDetail("handloom-cotton", NOW)
    expect(fabric!.variants.map((v) => v.label)).toEqual(["Sage", "Sand", "Indigo"]) // in the order they were defined
    expect(fabric!.variants[0]!.size).toBeUndefined()
  })
})
