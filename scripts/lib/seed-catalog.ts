import mongoose from "mongoose"
import { Category, type CategoryDoc } from "@/models/category"
import { Collection } from "@/models/collection"
import { Product } from "@/models/product"
import { ProductVariant } from "@/models/product-variant"
import { SiteSettings } from "@/models/site-settings"
import { linkProductsToTaxa } from "@/services/admin-taxonomy-service"
import { refreshProductSummary } from "@/services/catalog-service"
import type { Id } from "@/models/_shared"
import {
  buildSampleProducts,
  CATEGORY_SPECS,
  SAMPLE_COLLECTION_SLUGS,
  SAMPLE_TAG,
  skuFor,
} from "./sample-catalog"

/** Writes sample data through the real models, so every validator and hook runs. Needs an open connection. */

const DAY = 86_400_000

/** Creates any missing category and leaves existing ones (which an admin may have edited) alone. */
export async function seedCategories(): Promise<Map<string, CategoryDoc>> {
  const bySlug = new Map<string, CategoryDoc>()
  for (const spec of CATEGORY_SPECS) {
    const parent = spec.parent ? bySlug.get(spec.parent) : undefined
    const existing = await Category.findOne({ slug: spec.slug }).lean<CategoryDoc>()
    if (existing) {
      bySlug.set(spec.slug, existing)
      continue
    }
    const created = await Category.create({
      name: spec.name,
      slug: spec.slug,
      sortOrder: spec.sortOrder,
      ...(parent ? { parentId: parent._id, ancestors: [parent._id] } : {}),
    })
    bySlug.set(spec.slug, created.toObject() as CategoryDoc)
  }
  return bySlug
}

export async function removeSampleCatalog(): Promise<{
  products: number
  variants: number
  collections: number
}> {
  const products = await Product.find({ tags: SAMPLE_TAG }).select({ _id: 1 }).lean<{ _id: Id }[]>()
  const ids = products.map((p) => p._id)
  const variants = await ProductVariant.deleteMany({ productId: mongoose.trusted({ $in: ids }) })
  const removed = await Product.deleteMany({ _id: mongoose.trusted({ $in: ids }) })
  const collections = await Collection.deleteMany({
    slug: mongoose.trusted({ $in: [...SAMPLE_COLLECTION_SLUGS] }),
  })
  return {
    products: removed.deletedCount,
    variants: variants.deletedCount,
    collections: collections.deletedCount,
  }
}

export async function seedSampleCatalog(
  now = new Date()
): Promise<{ products: number; variants: number }> {
  const categories = await seedCategories()
  await removeSampleCatalog() // re-seeding replaces sample data, so stock and dates start fresh

  const specs = buildSampleProducts()
  let variantCount = 0
  const createdIds = new Map<string, Id>()

  for (const [index, spec] of specs.entries()) {
    const category = categories.get(spec.category)
    if (!category)
      throw new Error(`sample product "${spec.name}" uses unknown category "${spec.category}"`)

    const product = await Product.create({
      name: spec.name,
      slug: spec.slug,
      status: "active",
      shortDescription: spec.shortDescription,
      description: `${spec.shortDescription}\n\nSample product for development. Replace with real details in the admin.`,
      categoryIds: [category._id],
      tags: spec.tags,
      searchKeywords: spec.keywords ?? [],
      attributes: {
        fabricType: spec.fabricType,
        material: spec.material,
        composition: spec.composition,
        // "plain" is the absence of a print, not a print.
        pattern: spec.pattern === "plain" ? undefined : spec.pattern,
        widthMm: spec.widthMm,
        occasion: spec.occasion ?? [],
        colorFamily: [
          ...new Set(spec.variants.flatMap((v) => (v.colour ? [v.colour.family] : []))),
        ],
        careInstructions: ["Wash separately in cold water", "Dry in shade"],
        origin: "India",
      },
      returnable: spec.returnable,
      flags: { featured: false, bestseller: false, newArrival: false, ...spec.flags },
      newUntil: spec.flags.newArrival ? new Date(now.getTime() + 14 * DAY) : undefined,
      soldCount: spec.soldCount,
      publishedAt: new Date(now.getTime() - spec.daysAgoPublished * DAY),
      seo: {},
    })
    createdIds.set(spec.slug, product._id)

    const unitBase = spec.unit.baseUnitsPerDisplayUnit
    await ProductVariant.insertMany(
      spec.variants.map((v, order) => ({
        productId: product._id,
        sortOrder: order,
        sku: skuFor(index, spec, v),
        status: "active",
        options: {
          colorName: v.colour?.name,
          colorHex: v.colour?.hex,
          size: v.size,
          pattern: spec.pattern,
        },
        sellingUnit: spec.unit,
        pricePaise: v.pricePaise,
        compareAtPaise: v.compareAtPaise,
        salePricePaise: v.salePricePaise,
        saleStartsAt:
          v.saleStartsInDays === undefined
            ? undefined
            : new Date(now.getTime() + v.saleStartsInDays * DAY),
        saleEndsAt:
          v.saleEndsInDays === undefined
            ? undefined
            : new Date(now.getTime() + v.saleEndsInDays * DAY),
        stock: { onHand: v.stockDisplay * unitBase, reserved: 0 },
        lowStockThreshold: v.lowStockDisplay * unitBase,
      }))
    )
    variantCount += spec.variants.length
    await refreshProductSummary(product._id, now)
  }

  const byTag = (tag: string) =>
    specs.filter((s) => s.tags.includes(tag)).map((s) => createdIds.get(s.slug) as Id)
  await Collection.create([
    {
      name: "Navratri edit",
      slug: "navratri-edit",
      type: "manual",
      productIds: byTag("navratri"),
      description: "Festive fabrics and dupattas for the nine nights.",
    },
    {
      name: "Everyday cottons",
      slug: "everyday-cottons",
      type: "smart",
      rule: { tag: "monsoon" },
      description: "Breathable cottons for daily wear.",
    },
    {
      name: "Festive tissue",
      slug: "festive-tissue",
      type: "smart",
      rule: { categoryId: categories.get("tissue-fabrics")?._id },
      description: "Metallic tissue for celebrations.",
    },
  ])

  await SiteSettings.updateOne(
    { key: "default" },
    { $setOnInsert: { key: "default" } },
    { upsert: true }
  )
  // Fabrics and prints are master lists shared by every product: create them from what the products say.
  await linkProductsToTaxa()
  return { products: specs.length, variants: variantCount }
}
