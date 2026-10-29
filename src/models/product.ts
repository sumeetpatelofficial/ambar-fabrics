import { Schema } from "mongoose"
import {
  imageSchema,
  intField,
  modelFor,
  seoSchema,
  slugField,
  type Id,
  type ImageRef,
  type Seo,
} from "./_shared"

export interface ProductAttributes {
  fabricType?: string
  material?: string
  composition?: string
  pattern?: string
  colorFamily: string[]
  widthMm?: number
  careInstructions: string[]
  origin?: string
  occasion: string[]
}

export interface Swatch {
  name: string
  hex: string
}

export interface ProductDoc {
  _id: Id
  name: string
  slug: string
  status: "draft" | "active" | "archived"
  shortDescription?: string
  /** Plain text; blank lines separate paragraphs. Rich text arrives with a sanitiser in the admin phase. */
  description?: string
  /** Leaf categories first. A product listed under a parent category is found through its children. */
  categoryIds: Id[]
  /** The master fabric and print this product uses (see Taxon). The names are copied into `attributes` so filters stay fast. */
  fabricId?: Id | null
  printId?: Id | null
  collectionIds: Id[]
  brand?: string
  tags: string[]
  searchKeywords: string[]
  attributes: ProductAttributes
  images: ImageRef[]
  hsnCode?: string
  /** Null means "use the category or store default". Only used once tax is switched on in settings. */
  taxRatePercent?: number | null
  weightGrams?: number
  dimensionsMm?: { l?: number; w?: number; h?: number }
  returnable: boolean
  flags: { featured: boolean; bestseller: boolean; newArrival: boolean }
  newUntil?: Date

  // ---- denormalised from variants by catalogService.refreshProductSummary (never edited by hand)
  unitKind?: "length" | "piece" | "set" | "pair" | "pack"
  priceUnitLabel?: string
  priceRange?: { minPaise: number; maxPaise: number; compareAtMinPaise?: number }
  inStock: boolean
  swatches: Swatch[]
  variantCount: number

  soldCount: number
  ratingAvg: number
  ratingCount: number
  seo?: Seo
  publishedAt?: Date
  createdAt: Date
  updatedAt: Date
}

const attributesSchema = new Schema<ProductAttributes>(
  {
    fabricType: { type: String, trim: true, lowercase: true, maxlength: 60 },
    material: { type: String, trim: true, lowercase: true, maxlength: 60 },
    composition: { type: String, trim: true, maxlength: 200 },
    pattern: { type: String, trim: true, lowercase: true, maxlength: 60 },
    colorFamily: {
      type: [{ type: String, trim: true, lowercase: true, maxlength: 40 }],
      default: [],
    },
    widthMm: intField(),
    careInstructions: { type: [{ type: String, trim: true, maxlength: 200 }], default: [] },
    origin: { type: String, trim: true, maxlength: 80 },
    occasion: { type: [{ type: String, trim: true, lowercase: true, maxlength: 40 }], default: [] },
  },
  { _id: false }
)

const swatchSchema = new Schema<Swatch>(
  {
    name: { type: String, required: true, trim: true, maxlength: 40 },
    hex: { type: String, required: true, match: /^#[0-9a-fA-F]{6}$/ },
  },
  { _id: false }
)

const productSchema = new Schema<ProductDoc>(
  {
    name: { type: String, required: true, trim: true, maxlength: 140 },
    slug: slugField,
    status: { type: String, enum: ["draft", "active", "archived"], default: "draft" },
    shortDescription: { type: String, trim: true, maxlength: 300 },
    description: { type: String, trim: true, maxlength: 10_000 },
    categoryIds: { type: [Schema.Types.ObjectId], default: [], ref: "Category" },
    fabricId: { type: Schema.Types.ObjectId, ref: "Taxon", default: null },
    printId: { type: Schema.Types.ObjectId, ref: "Taxon", default: null },
    collectionIds: { type: [Schema.Types.ObjectId], default: [], ref: "Collection" },
    brand: { type: String, trim: true, maxlength: 80 },
    tags: { type: [{ type: String, trim: true, lowercase: true, maxlength: 60 }], default: [] },
    searchKeywords: {
      type: [{ type: String, trim: true, lowercase: true, maxlength: 60 }],
      default: [],
    },
    attributes: { type: attributesSchema, default: () => ({}) },
    images: {
      type: [imageSchema],
      default: [],
      validate: { validator: (v: unknown[]) => v.length <= 12, message: "at most 12 images" },
    },
    hsnCode: { type: String, trim: true, match: /^\d{4,8}$/ },
    taxRatePercent: { type: Number, min: 0, max: 100, default: null },
    weightGrams: intField(),
    dimensionsMm: { l: intField(), w: intField(), h: intField(), _id: false },
    returnable: { type: Boolean, default: true },
    flags: {
      featured: { type: Boolean, default: false },
      bestseller: { type: Boolean, default: false },
      newArrival: { type: Boolean, default: false },
      _id: false,
    },
    newUntil: Date,

    unitKind: { type: String, enum: ["length", "piece", "set", "pair", "pack"] },
    priceUnitLabel: { type: String, trim: true, maxlength: 20 },
    priceRange: {
      minPaise: intField(),
      maxPaise: intField(),
      compareAtMinPaise: intField(),
      _id: false,
    },
    inStock: { type: Boolean, default: false },
    swatches: { type: [swatchSchema], default: [] },
    variantCount: intField({ default: 0 }),

    soldCount: intField({ default: 0 }),
    ratingAvg: { type: Number, min: 0, max: 5, default: 0 },
    ratingCount: intField({ default: 0 }),
    seo: seoSchema,
    publishedAt: Date,
  },
  { timestamps: true }
)

// Listing pages: status + category (or collection) + newest first.
productSchema.index({ status: 1, categoryIds: 1, publishedAt: -1 })
productSchema.index({ fabricId: 1 }, { sparse: true })
productSchema.index({ printId: 1 }, { sparse: true })
productSchema.index({ status: 1, collectionIds: 1, publishedAt: -1 })
productSchema.index({ status: 1, publishedAt: -1 })
productSchema.index({ status: 1, "priceRange.minPaise": 1 })
productSchema.index({ status: 1, "flags.bestseller": 1, soldCount: -1 })
productSchema.index({ status: 1, "flags.newArrival": 1, publishedAt: -1 })
// Filter facets.
productSchema.index({ status: 1, "attributes.fabricType": 1 })
productSchema.index({ status: 1, "attributes.colorFamily": 1 })
productSchema.index({ status: 1, "attributes.pattern": 1 })
// Search. One text index per collection; weights favour the name, then keywords and attributes.
productSchema.index(
  {
    name: "text",
    tags: "text",
    searchKeywords: "text",
    "attributes.fabricType": "text",
    "attributes.pattern": "text",
    "attributes.material": "text",
    shortDescription: "text",
  },
  {
    name: "product_text",
    weights: {
      name: 10,
      searchKeywords: 5,
      tags: 5,
      "attributes.fabricType": 3,
      "attributes.pattern": 3,
      "attributes.material": 2,
      shortDescription: 1,
    },
    default_language: "none", // no stemming: fabric and craft names (bandhani, chinon) must match literally
  }
)

export const Product = modelFor<ProductDoc>("Product", productSchema)
