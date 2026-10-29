import "server-only"
import mongoose from "mongoose"
import type {
  CategoryInput,
  CollectionInput,
  ProductInput,
  VariantInput,
} from "@/features/admin/catalog-schemas"
import { assertConsistentUnits } from "@/features/catalog/pricing"
import { connectDb } from "@/lib/db/mongoose"
import { NotFoundError, ValidationError } from "@/lib/errors"
import { parseDisplayQuantity, units, type SellingUnit } from "@/lib/measure"
import { rupeesToPaise } from "@/lib/money"
import { roleHasPermission } from "@/config/permissions"
import { assertPermission, type Actor } from "@/lib/security/authorize"
import { slugify } from "@/lib/slug"
import { layoutProblem, type Layout } from "@/lib/tree-order"
import { Category, type CategoryDoc } from "@/models/category"
import { Collection, type CollectionDoc } from "@/models/collection"
import { Product, type ProductDoc } from "@/models/product"
import { ProductVariant, type ProductVariantDoc } from "@/models/product-variant"
import { Redirect } from "@/models/redirect"
import { recordAudit } from "@/services/audit-service"
import { refreshProductSummary } from "@/services/catalog-service"
import { resolveTaxa } from "@/services/admin-taxonomy-service"

const trusted = mongoose.trusted
const oid = (id: string) => new mongoose.Types.ObjectId(id)
const fieldError = (path: string, issue: string) =>
  new ValidationError("Please check the highlighted fields.", [{ path, issue }])

function mongoMessage(error: unknown): ValidationError | null {
  const e = error as {
    name?: string
    code?: number
    keyPattern?: Record<string, unknown>
    errors?: Record<string, { message: string }>
  }
  if (e?.code === 11000) {
    const key = Object.keys(e.keyPattern ?? {})[0] ?? "slug"
    return fieldError(
      key === "sku" ? "sku" : key === "code" ? "code" : "slug",
      "That is already used. Choose another."
    )
  }
  if (e?.name === "ValidationError" && e.errors) {
    const details = Object.entries(e.errors).map(([path, v]) => ({
      path: path.split(".")[0]!,
      issue: v.message,
    }))
    return new ValidationError("Please check the highlighted fields.", details)
  }
  return null
}

// ------------------------------------------------------------------ products

export type ProductRow = {
  id: string
  name: string
  slug: string
  status: ProductDoc["status"]
  variants: number
  inStock: boolean
  priceRange?: ProductDoc["priceRange"]
  unitLabel?: string
  imageUrl?: string
  imageAlt?: string
  swatch?: string
  category?: string
}

export async function listProductsAdmin(
  actor: Actor,
  opts: { q?: string; status?: string; page?: number } = {}
): Promise<{ rows: ProductRow[]; total: number; pageSize: number }> {
  assertPermission(actor, "catalog:read")
  await connectDb()
  const pageSize = 20 // a full grid of cards
  const filter: Record<string, unknown> = {}
  if (opts.status && ["draft", "active", "archived"].includes(opts.status))
    filter.status = opts.status
  if (opts.q?.trim()) {
    const escaped = opts.q
      .trim()
      .slice(0, 60)
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    filter.$or = [{ name: new RegExp(escaped, "i") }, { slug: new RegExp(escaped, "i") }]
  }
  const [rows, total] = await Promise.all([
    Product.find(filter as never)
      .sort({ updatedAt: -1, _id: -1 })
      .skip((Math.max(1, opts.page ?? 1) - 1) * pageSize)
      .limit(pageSize)
      .lean<ProductDoc[]>(),
    Product.countDocuments(filter as never),
  ])
  const categories = await Category.find({
    _id: trusted({ $in: rows.flatMap((p) => p.categoryIds) }),
  } as never)
    .select({ name: 1 })
    .lean<{ _id: mongoose.Types.ObjectId; name: string }[]>()
  const categoryName = new Map(categories.map((c) => [String(c._id), c.name]))
  return {
    total,
    pageSize,
    rows: rows.map((p) => {
      const image = [...(p.images ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)[0]
      return {
        id: String(p._id),
        name: p.name,
        slug: p.slug,
        status: p.status,
        variants: p.variantCount,
        inStock: p.inStock,
        priceRange: p.priceRange,
        unitLabel: p.priceUnitLabel,
        imageUrl: image?.url,
        imageAlt: image?.alt,
        swatch: p.swatches?.[0]?.hex,
        category: categoryName.get(String(p.categoryIds[0])),
      }
    }),
  }
}

export type ProductAdminView = { product: ProductDoc; variants: ProductVariantDoc[] }

export async function getProductAdmin(actor: Actor, id: string): Promise<ProductAdminView> {
  assertPermission(actor, "catalog:read")
  await connectDb()
  if (!mongoose.isValidObjectId(id)) throw new NotFoundError()
  const product = await Product.findById(id).lean<ProductDoc>()
  if (!product) throw new NotFoundError()
  const variants = await ProductVariant.find({ productId: product._id })
    .sort({ sortOrder: 1, sku: 1 })
    .lean<ProductVariantDoc[]>()
  // What the shop paid is private: it is removed here, not just hidden by the page.
  if (!roleHasPermission(actor.role, "costs:read")) for (const v of variants) delete v.costPaise
  return { product, variants }
}

/** Creates or updates a product. A changed slug leaves a permanent redirect from the old address. */
export async function saveProduct(
  actor: Actor,
  id: string | null,
  input: ProductInput
): Promise<{ id: string; slug: string }> {
  assertPermission(actor, "catalog:write")
  await connectDb()
  const category = await Category.findById(oid(input.categoryId)).lean<CategoryDoc>()
  if (!category) throw fieldError("categoryId", "That category no longer exists.")
  const taxa = await resolveTaxa({ fabricId: input.fabricId, printId: input.printId })
  const slug = input.slug ?? slugify(input.name)
  if (!slug) throw fieldError("slug", "Enter a web address.")

  const existing = id ? await Product.findById(oid(id)).lean<ProductDoc>() : null
  if (id && !existing) throw new NotFoundError()
  const doc = {
    name: input.name,
    slug,
    status: input.status,
    shortDescription: input.shortDescription,
    description: input.description,
    categoryIds: [category._id],
    fabricId: taxa.fabric?._id ?? null,
    printId: taxa.print?._id ?? null,
    tags: input.tags,
    returnable: input.returnable,
    flags: { featured: input.featured, bestseller: input.bestseller, newArrival: input.newArrival },
    newUntil: input.newArrival
      ? (existing?.newUntil ?? new Date(Date.now() + 30 * 86_400_000))
      : undefined,
    attributes: {
      // The master fabric and print are the truth; their names are copied here so filters stay fast.
      fabricType: taxa.fabric?.name.toLowerCase(),
      material: input.material,
      composition: input.composition,
      pattern: taxa.print?.name.toLowerCase(),
      widthMm: input.widthCm,
      careInstructions: input.careInstructions,
      origin: input.origin,
      occasion: input.occasion,
      colorFamily: existing?.attributes?.colorFamily ?? [],
    },
    hsnCode: input.hsnCode,
    taxRatePercent: input.taxRatePercent ?? null,
    weightGrams: input.weightGrams,
    images: input.images,
    seo: { title: input.seoTitle, description: input.seoDescription },
    ...(input.status === "active" && !existing?.publishedAt ? { publishedAt: new Date() } : {}),
  }
  try {
    let savedId: string
    if (existing) {
      // Read, change, save: the model's own rules run on the result.
      const loaded = await Product.findById(existing._id)
      if (!loaded) throw new NotFoundError()
      loaded.set(doc)
      await loaded.save()
      savedId = String(loaded._id)
      if (existing.slug !== slug && existing.status === "active") {
        await Redirect.updateOne(
          { fromPath: `/products/${existing.slug}` },
          { $set: { toPath: `/products/${slug}`, statusCode: 301 } },
          { upsert: true }
        )
      }
    } else {
      const created = await Product.create(doc)
      savedId = String(created._id)
    }
    await refreshProductSummary(oid(savedId))
    await recordAudit({
      action: existing ? "product.updated" : "product.created",
      actor,
      entityType: "product",
      entityId: savedId,
      details: { slug },
    })
    return { id: savedId, slug }
  } catch (error) {
    throw mongoMessage(error) ?? error
  }
}

// ------------------------------------------------------------------ variants

function unitFor(input: VariantInput): SellingUnit {
  const base = input.kind === "length" ? units.perMetre() : units.each(input.kind)
  const parse = (text: string | undefined, path: string, fallback: number | undefined) => {
    if (!text) return fallback
    const p = parseDisplayQuantity(base, text)
    if (!p.ok) throw fieldError(path, p.message)
    return p.qty
  }
  const min = parse(input.minQty, "minQty", base.minQty)!
  const step = parse(input.stepQty, "stepQty", base.stepQty)!
  const max = parse(input.maxQty, "maxQty", undefined)
  return { ...base, minQty: min, stepQty: step, ...(max ? { maxQtyPerOrder: max } : {}) }
}

const toDate = (v: string | undefined, endOfDay = false) =>
  v ? new Date(`${v}T${endOfDay ? "23:59:59" : "00:00:00"}+05:30`) : undefined

function priceOf(text: string | undefined, path: string) {
  if (!text) return undefined
  try {
    return rupeesToPaise(text)
  } catch {
    throw fieldError(path, "Enter rupees, like 180 or 180.50.")
  }
}

/** Adds or changes a sellable variant. Stock changes after creation go through the inventory screen, which keeps a record. */
export async function saveVariant(
  actor: Actor,
  productId: string,
  variantId: string | null,
  input: VariantInput
): Promise<{ id: string }> {
  assertPermission(actor, "catalog:write")
  await connectDb()
  const product = await Product.findById(oid(productId)).lean<ProductDoc>()
  if (!product) throw new NotFoundError()
  const unit = unitFor(input)
  const siblings = await ProductVariant.find({
    productId: product._id,
    ...(variantId ? { _id: trusted({ $ne: oid(variantId) }) } : {}),
  } as never).lean<ProductVariantDoc[]>()
  assertConsistentUnits([
    ...siblings.filter((s) => s.status === "active"),
    { sku: input.sku, sellingUnit: unit },
  ])

  const doc = {
    sku: input.sku,
    status: input.status,
    options: {
      colorName: input.colorName,
      colorHex: input.colorHex,
      size: input.size,
      pattern: product.attributes?.pattern,
    },
    sellingUnit: unit,
    pricePaise: priceOf(input.price, "price"),
    compareAtPaise: priceOf(input.compareAt, "compareAt"),
    salePricePaise: priceOf(input.salePrice, "salePrice"),
    saleStartsAt: toDate(input.saleStartsAt),
    saleEndsAt: toDate(input.saleEndsAt, true),
    lowStockThreshold: input.lowStock
      ? parseDisplayQuantity(unit, input.lowStock).ok
        ? (parseDisplayQuantity(unit, input.lowStock) as { qty: number }).qty
        : 0
      : 0,
    weightGrams: input.weightGrams ? Number(input.weightGrams) : undefined,
  }
  // Cost is written only by people who may see it; for everyone else the stored figure is left alone.
  const canSetCost = roleHasPermission(actor.role, "costs:read")
  const costPaise = canSetCost ? priceOf(input.purchasePrice, "purchasePrice") : undefined
  try {
    let id: string
    if (variantId) {
      const loaded = await ProductVariant.findOne({ _id: oid(variantId), productId: product._id })
      if (!loaded) throw new NotFoundError()
      // A price unit cannot change under stock already counted in another unit.
      if (loaded.sellingUnit.kind !== unit.kind && loaded.stock.onHand > 0)
        throw fieldError(
          "kind",
          "Sell this in the same unit while it has stock. Adjust stock to zero first."
        )
      loaded.set(doc)
      loaded.set("compareAtPaise", doc.compareAtPaise ?? undefined)
      loaded.set("salePricePaise", doc.salePricePaise ?? undefined)
      if (canSetCost) loaded.set("costPaise", costPaise ?? undefined)
      await loaded.save()
      id = String(loaded._id)
    } else {
      const initial = input.initialStock
        ? parseDisplayQuantity(unit, input.initialStock)
        : { ok: true as const, qty: 0 }
      if (!initial.ok) throw fieldError("initialStock", initial.message)
      const count = await ProductVariant.countDocuments({ productId: product._id })
      const created = await ProductVariant.create({
        ...doc,
        productId: product._id,
        sortOrder: count,
        ...(costPaise !== undefined ? { costPaise } : {}),
        stock: { onHand: initial.qty, reserved: 0 },
      })
      id = String(created._id)
    }
    await refreshProductSummary(product._id)
    await recordAudit({
      action: variantId ? "variant.updated" : "variant.created",
      actor,
      entityType: "variant",
      entityId: id,
      details: { sku: input.sku },
    })
    return { id }
  } catch (error) {
    throw mongoMessage(error) ?? error
  }
}

// ------------------------------------------------------------------ categories and collections

export async function listCategoriesAdmin(actor: Actor): Promise<CategoryDoc[]> {
  assertPermission(actor, "catalog:read")
  await connectDb()
  return Category.find({}).sort({ parentId: 1, sortOrder: 1, name: 1 }).lean<CategoryDoc[]>()
}

export async function getCategoryAdmin(actor: Actor, id: string): Promise<CategoryDoc> {
  assertPermission(actor, "catalog:read")
  await connectDb()
  if (!mongoose.isValidObjectId(id)) throw new NotFoundError()
  const c = await Category.findById(id).lean<CategoryDoc>()
  if (!c) throw new NotFoundError()
  return c
}

export async function saveCategory(
  actor: Actor,
  id: string | null,
  input: CategoryInput
): Promise<{ id: string }> {
  assertPermission(actor, "catalog:write")
  await connectDb()
  let parent: CategoryDoc | null = null
  if (input.parentId) {
    if (id && input.parentId === id)
      throw fieldError("parentId", "A category cannot be its own parent.")
    parent = await Category.findById(oid(input.parentId)).lean<CategoryDoc>()
    if (!parent) throw fieldError("parentId", "That parent no longer exists.")
    if (parent.parentId)
      throw fieldError("parentId", "Categories go one level deep: choose a top-level parent.")
    if (id && (await Category.exists({ parentId: oid(id) })))
      throw fieldError("parentId", "This category has sub-categories, so it must stay top-level.")
  }
  const doc = {
    name: input.name,
    slug: input.slug ?? slugify(input.name),
    description: input.description,
    sortOrder: input.sortOrder,
    status: input.status,
    parentId: parent?._id ?? null,
    ancestors: parent ? [parent._id] : [],
  }
  try {
    let savedId: string
    if (id) {
      const loaded = await Category.findById(oid(id))
      if (!loaded) throw new NotFoundError()
      loaded.set(doc)
      await loaded.save()
      savedId = id
    } else savedId = String((await Category.create(doc))._id)
    await recordAudit({
      action: id ? "category.updated" : "category.created",
      actor,
      entityType: "category",
      entityId: savedId,
    })
    return { id: savedId }
  } catch (error) {
    throw mongoMessage(error) ?? error
  }
}

export async function listCollectionsAdmin(actor: Actor): Promise<CollectionDoc[]> {
  assertPermission(actor, "catalog:read")
  await connectDb()
  return Collection.find({}).sort({ name: 1 }).lean<CollectionDoc[]>()
}

export async function getCollectionAdmin(
  actor: Actor,
  id: string
): Promise<CollectionDoc & { productSlugs: string[] }> {
  assertPermission(actor, "catalog:read")
  await connectDb()
  if (!mongoose.isValidObjectId(id)) throw new NotFoundError()
  const c = await Collection.findById(id).lean<CollectionDoc>()
  if (!c) throw new NotFoundError()
  const products = await Product.find({ _id: trusted({ $in: c.productIds }) } as never)
    .select({ slug: 1 })
    .lean<{ slug: string }[]>()
  return { ...c, productSlugs: products.map((p) => p.slug) }
}

export async function saveCollection(
  actor: Actor,
  id: string | null,
  input: CollectionInput
): Promise<{ id: string }> {
  assertPermission(actor, "catalog:write")
  await connectDb()
  let productIds: mongoose.Types.ObjectId[] = []
  if (input.type === "manual") {
    const products = await Product.find({ slug: trusted({ $in: input.productSlugs }) } as never)
      .select({ slug: 1 })
      .lean<{ _id: mongoose.Types.ObjectId; slug: string }[]>()
    const found = new Set(products.map((p) => p.slug))
    const missing = input.productSlugs.filter((s) => !found.has(s))
    if (missing.length)
      throw fieldError(
        "productSlugs",
        `No product with the address: ${missing.slice(0, 3).join(", ")}.`
      )
    productIds = products.map((p) => p._id)
  } else if (!input.ruleTag && !input.ruleFlag && !input.ruleCategoryId) {
    throw fieldError("ruleTag", "Choose a tag, a highlight or a category for the rule.")
  }
  const doc = {
    name: input.name,
    slug: input.slug ?? slugify(input.name),
    description: input.description,
    type: input.type,
    productIds,
    rule:
      input.type === "smart"
        ? {
            tag: input.ruleTag?.toLowerCase(),
            flag: input.ruleFlag,
            categoryId: input.ruleCategoryId ? oid(input.ruleCategoryId) : undefined,
          }
        : undefined,
    status: input.status,
  }
  try {
    let savedId: string
    if (id) {
      const loaded = await Collection.findById(oid(id))
      if (!loaded) throw new NotFoundError()
      loaded.set(doc)
      await loaded.save()
      savedId = id
    } else savedId = String((await Collection.create(doc))._id)
    await recordAudit({
      action: id ? "collection.updated" : "collection.created",
      actor,
      entityType: "collection",
      entityId: savedId,
    })
    return { id: savedId }
  } catch (error) {
    throw mongoMessage(error) ?? error
  }
}

// ------------------------------------------------------------------ a product with its first variants, in one go

/**
 * Checks a variant's numbers without touching the database: price rules, ordering rules in metres, the
 * starting quantity. Throws the same field errors saving would. Used to refuse a whole new product before
 * anything is created.
 */
export function dryRunVariant(input: VariantInput): void {
  const unit = unitFor(input)
  const price = priceOf(input.price, "price")
  if (price === undefined || price <= 0) throw fieldError("price", "Enter the selling price.")
  priceOf(input.purchasePrice, "purchasePrice")
  const compare = priceOf(input.compareAt, "compareAt")
  const sale = priceOf(input.salePrice, "salePrice")
  if (sale !== undefined && sale >= price)
    throw fieldError("salePrice", "The sale price must be lower than the price.")
  if (compare !== undefined && compare <= price)
    throw fieldError("compareAt", "The original price must be higher than the price.")
  if (input.initialStock) {
    const p = parseDisplayQuantity(unit, input.initialStock)
    if (!p.ok) throw fieldError("initialStock", p.message)
  }
}

const prefixDetails = (error: unknown, index: number): unknown => {
  if (error instanceof ValidationError && Array.isArray(error.details))
    return new ValidationError(
      error.message,
      (error.details as { path: string; issue: string }[]).map((d) => ({
        path: `variants.${index}.${d.path}`,
        issue: d.issue,
      }))
    )
  return error
}

/** A readable code for a variant when the person leaves it blank: the product, then the colour or size. */
async function suggestSku(
  productSlug: string,
  input: VariantInput,
  index: number
): Promise<string> {
  const part = (s?: string) =>
    (s ?? "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "")
      .slice(0, 10)
  const base = [
    part(productSlug.replace(/-/g, "")).slice(0, 12),
    part(input.colorName) || part(input.size) || `V${index + 1}`,
  ]
    .filter(Boolean)
    .join("-")
  let candidate = base
  for (let n = 2; await ProductVariant.exists({ sku: candidate }); n++) candidate = `${base}-${n}`
  return candidate
}

/**
 * Creates a product and its first variants (colours, prices, what was paid, stock) together. Every variant
 * is checked before anything is written; if a later step still fails, what was created is removed, so there
 * is never a half-made product.
 */
export async function createProductWithVariants(
  actor: Actor,
  productInput: ProductInput,
  drafts: VariantInput[]
): Promise<{ id: string; slug: string }> {
  assertPermission(actor, "catalog:write")
  if (drafts.length > 20)
    throw fieldError("variants", "At most 20 variants at once. Add the rest afterwards.")
  drafts.forEach((d, i) => {
    try {
      dryRunVariant(d)
    } catch (error) {
      throw prefixDetails(error, i)
    }
  })
  const kinds = new Set(drafts.filter((d) => d.status === "active").map((d) => d.kind))
  if (kinds.size > 1)
    throw prefixDetails(
      fieldError(
        "kind",
        "All variants of a product must be sold the same way (all by length, or all by piece)."
      ),
      1
    )
  const names = drafts.map((d) => `${d.colorName ?? ""}|${d.size ?? ""}`.toLowerCase())
  const dup = names.findIndex((n, i) => n !== "|" && names.indexOf(n) !== i)
  if (dup >= 0)
    throw prefixDetails(
      fieldError("colorName", "Another variant already has this colour and size."),
      dup
    )

  await connectDb()
  const product = await saveProduct(actor, null, productInput)
  try {
    for (const [i, d] of drafts.entries()) {
      const sku = d.sku || (await suggestSku(product.slug, d, i))
      try {
        await saveVariant(actor, product.id, null, { ...d, sku })
      } catch (error) {
        throw prefixDetails(error, i)
      }
    }
  } catch (error) {
    await ProductVariant.deleteMany({ productId: oid(product.id) })
    await Product.deleteOne({ _id: oid(product.id) })
    await recordAudit({
      action: "product.create_rolled_back",
      actor,
      entityType: "product",
      entityId: product.id,
    })
    throw error
  }
  return product
}

// ------------------------------------------------------------------ the category menu, by dragging

/**
 * Saves the whole category menu as arranged on screen: the order of the top-level categories, and which
 * ones sit under which, in order. The order must describe exactly the categories that exist now, so two
 * people editing at once cannot silently undo each other.
 */
export async function reorderCategories(actor: Actor, layout: Layout): Promise<void> {
  assertPermission(actor, "catalog:write")
  await connectDb()
  const all = await Category.find({}).select({ _id: 1 }).lean<{ _id: mongoose.Types.ObjectId }[]>()
  const problem = layoutProblem(
    layout,
    all.map((c) => String(c._id))
  )
  if (problem) throw new ValidationError(problem)
  const ops = layout.flatMap((top, i) => [
    {
      updateOne: {
        filter: { _id: oid(top.id) },
        update: { $set: { parentId: null, ancestors: [], sortOrder: i + 1 } },
      },
    },
    ...top.children.map((child, j) => ({
      updateOne: {
        filter: { _id: oid(child) },
        update: { $set: { parentId: oid(top.id), ancestors: [oid(top.id)], sortOrder: j + 1 } },
      },
    })),
  ])
  await Category.bulkWrite(ops)
  await recordAudit({ action: "category.reordered", actor, entityType: "category" })
}

/** How many products sit directly in each category, for the category screen. */
export async function categoryProductCounts(actor: Actor): Promise<Record<string, number>> {
  assertPermission(actor, "catalog:read")
  await connectDb()
  const rows = await Product.aggregate<{ _id: mongoose.Types.ObjectId; n: number }>([
    { $unwind: "$categoryIds" },
    { $group: { _id: "$categoryIds", n: { $sum: 1 } } },
  ])
  return Object.fromEntries(rows.map((r) => [String(r._id), r.n]))
}
