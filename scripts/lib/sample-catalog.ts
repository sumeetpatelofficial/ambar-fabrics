import { units, type SellingUnit } from "@/lib/measure"
import { slugify } from "@/lib/slug"

/**
 * Deterministic sample data for development, tests and demos. Pure: no database access.
 * Product names and prices here are examples, not the store's real catalogue. Everything sample is
 * tagged "sample-data" and its SKUs start with "DEMO-", so it can be removed without touching real data.
 */
export const SAMPLE_TAG = "sample-data"

export type CategorySpec = { name: string; slug: string; parent?: string; sortOrder: number }

// Structure follows the owner's categories. Dupatta subcategories and trims are placeholders to confirm.
export const CATEGORY_SPECS: CategorySpec[] = [
  { name: "Fabrics", slug: "fabrics", sortOrder: 1 },
  { name: "Cotton", slug: "cotton-fabrics", parent: "fabrics", sortOrder: 1 },
  { name: "Crepe", slug: "crepe-fabrics", parent: "fabrics", sortOrder: 2 },
  { name: "Modal silk", slug: "modal-silk-fabrics", parent: "fabrics", sortOrder: 3 },
  { name: "Chinon", slug: "chinon-fabrics", parent: "fabrics", sortOrder: 4 },
  { name: "Tissue", slug: "tissue-fabrics", parent: "fabrics", sortOrder: 5 },
  { name: "Lace and borders", slug: "lace-and-borders", parent: "fabrics", sortOrder: 6 },
  { name: "Latkan and tassels", slug: "latkan-and-tassels", parent: "fabrics", sortOrder: 7 },
  { name: "Dupattas", slug: "dupattas", sortOrder: 2 },
  { name: "Bandhani", slug: "bandhani-dupattas", parent: "dupattas", sortOrder: 1 },
  { name: "Ajrakh", slug: "ajrakh-dupattas", parent: "dupattas", sortOrder: 2 },
  { name: "Printed", slug: "printed-dupattas", parent: "dupattas", sortOrder: 3 },
  { name: "Plain and dyed", slug: "plain-dupattas", parent: "dupattas", sortOrder: 4 },
  { name: "Blouses", slug: "blouses", sortOrder: 3 },
  { name: "Ready-made", slug: "ready-made", sortOrder: 4 },
  { name: "Kurtis", slug: "kurtis", parent: "ready-made", sortOrder: 1 },
  { name: "Dresses", slug: "dresses", parent: "ready-made", sortOrder: 2 },
  { name: "Unstitched suits", slug: "unstitched-suits", sortOrder: 5 },
]

export const SAMPLE_COLLECTION_SLUGS = [
  "navratri-edit",
  "everyday-cottons",
  "festive-tissue",
] as const

type Colour = { name: string; hex: string; family: string }
const C = {
  sage: { name: "Sage", hex: "#8a9a7b", family: "green" },
  sand: { name: "Sand", hex: "#d9cdb4", family: "neutral" },
  indigo: { name: "Indigo", hex: "#3d4a6b", family: "blue" },
  madder: { name: "Madder", hex: "#9a4431", family: "red" },
  mustard: { name: "Mustard", hex: "#c79a2d", family: "yellow" },
  rose: { name: "Dusty rose", hex: "#c98a86", family: "pink" },
  ivory: { name: "Ivory", hex: "#eee8da", family: "neutral" },
  teal: { name: "Teal", hex: "#3f5a52", family: "green" },
  charcoal: { name: "Charcoal", hex: "#3a3835", family: "grey" },
  gold: { name: "Antique gold", hex: "#a98a3e", family: "yellow" },
  plum: { name: "Plum", hex: "#5b3a52", family: "purple" },
} satisfies Record<string, Colour>

export type VariantSpec = {
  skuSuffix: string
  colour?: Colour
  size?: string
  pricePaise: number
  compareAtPaise?: number
  salePricePaise?: number
  /** Days relative to `now`. Negative = in the past. */
  saleStartsInDays?: number
  saleEndsInDays?: number
  /** In display units (metres for length, units otherwise), converted to base units when written. */
  stockDisplay: number
  lowStockDisplay: number
}

export type ProductSpec = {
  name: string
  slug: string
  category: string
  unit: SellingUnit
  fabricType?: string
  material?: string
  pattern?: string
  composition?: string
  widthMm?: number
  occasion?: string[]
  tags: string[]
  keywords?: string[]
  flags: { featured?: boolean; bestseller?: boolean; newArrival?: boolean }
  soldCount: number
  daysAgoPublished: number
  returnable: boolean
  shortDescription: string
  variants: VariantSpec[]
}

const cm = (n: number) => n * 10

function metrePrices(
  base: number,
  colours: Colour[],
  extra: Partial<VariantSpec> = {}
): VariantSpec[] {
  return colours.map((colour, i) => ({
    skuSuffix: colour.name
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 4),
    colour,
    pricePaise: base,
    stockDisplay: 40 + i * 15,
    lowStockDisplay: 5,
    ...extra,
  }))
}

function make(
  p: Omit<ProductSpec, "slug" | "tags"> & { slug?: string; tags?: string[] }
): ProductSpec {
  return { ...p, slug: p.slug ?? slugify(p.name), tags: [SAMPLE_TAG, ...(p.tags ?? [])] }
}

const fabricUnit = units.perMetre()
const laceUnit = units.perMetre({ minMm: 1000, stepMm: 100 })

export function buildSampleProducts(): ProductSpec[] {
  const p: ProductSpec[] = []

  // ---- Fabrics by the metre
  p.push(
    make({
      name: "Handloom cotton",
      category: "cotton-fabrics",
      unit: fabricUnit,
      fabricType: "cotton",
      material: "cotton",
      pattern: "plain",
      composition: "100% cotton",
      widthMm: cm(112),
      occasion: ["everyday"],
      tags: ["monsoon"],
      keywords: ["khadi", "summer", "kurta fabric"],
      flags: { featured: true, bestseller: true },
      soldCount: 120,
      daysAgoPublished: 90,
      returnable: false,
      shortDescription: "Soft handloom cotton with a natural slub, cut to the length you need.",
      variants: metrePrices(18000, [C.sage, C.sand, C.indigo]),
    }),
    make({
      name: "Mulmul cotton",
      category: "cotton-fabrics",
      unit: fabricUnit,
      fabricType: "cotton",
      material: "cotton",
      pattern: "plain",
      composition: "100% cotton",
      widthMm: cm(112),
      occasion: ["everyday", "summer"],
      tags: ["monsoon"],
      flags: { bestseller: true },
      soldCount: 85,
      daysAgoPublished: 70,
      returnable: false,
      shortDescription: "Lightweight, breathable mulmul for dupattas and summer kurtas.",
      variants: metrePrices(14000, [C.ivory, C.rose, C.mustard]),
    }),
    make({
      name: "Block print cotton",
      category: "cotton-fabrics",
      unit: fabricUnit,
      fabricType: "cotton",
      material: "cotton",
      pattern: "block print",
      composition: "100% cotton",
      widthMm: cm(112),
      occasion: ["everyday"],
      tags: ["monsoon"],
      flags: { newArrival: true },
      soldCount: 12,
      daysAgoPublished: 6,
      returnable: false,
      shortDescription: "Hand block printed cotton in earthy colours.",
      variants: metrePrices(22000, [C.madder, C.teal], {
        salePricePaise: 22000,
        saleStartsInDays: -3,
        saleEndsInDays: 10,
        pricePaise: 26000,
      }),
    }),
    make({
      name: "Printed crepe",
      category: "crepe-fabrics",
      unit: fabricUnit,
      fabricType: "crepe",
      material: "polyester crepe",
      pattern: "printed",
      composition: "100% polyester",
      widthMm: cm(112),
      occasion: ["festive", "party"],
      flags: {},
      soldCount: 40,
      daysAgoPublished: 50,
      returnable: false,
      shortDescription: "Fluid printed crepe with a soft drape.",
      variants: metrePrices(25000, [C.plum, C.indigo]),
    }),
    make({
      name: "Plain crepe",
      category: "crepe-fabrics",
      unit: fabricUnit,
      fabricType: "crepe",
      material: "polyester crepe",
      pattern: "plain",
      composition: "100% polyester",
      widthMm: cm(112),
      flags: {},
      soldCount: 22,
      daysAgoPublished: 45,
      returnable: false,
      shortDescription: "Everyday crepe in solid colours.",
      variants: metrePrices(16000, [C.charcoal, C.sand, C.sage]),
    }),
    make({
      name: "Modal silk",
      category: "modal-silk-fabrics",
      unit: fabricUnit,
      fabricType: "modal silk",
      material: "modal silk",
      pattern: "plain",
      composition: "Modal and silk blend",
      widthMm: cm(112),
      occasion: ["festive"],
      tags: ["navratri"],
      flags: { featured: true },
      soldCount: 55,
      daysAgoPublished: 30,
      returnable: false,
      shortDescription: "A soft sheen with a fall that suits kurtas and blouses.",
      variants: metrePrices(38000, [C.madder, C.teal, C.gold]),
    }),
    make({
      name: "Ajrakh print modal silk",
      category: "modal-silk-fabrics",
      unit: fabricUnit,
      fabricType: "modal silk",
      material: "modal silk",
      pattern: "ajrakh",
      composition: "Modal and silk blend",
      widthMm: cm(112),
      occasion: ["festive"],
      tags: ["navratri"],
      flags: { newArrival: true, featured: true },
      soldCount: 18,
      daysAgoPublished: 4,
      returnable: false,
      shortDescription: "Traditional Ajrakh geometry on modal silk.",
      variants: metrePrices(42000, [C.indigo, C.madder]),
    }),
    make({
      name: "Chinon",
      category: "chinon-fabrics",
      unit: fabricUnit,
      fabricType: "chinon",
      material: "chinon",
      pattern: "plain",
      composition: "100% polyester chiffon",
      widthMm: cm(112),
      occasion: ["party"],
      flags: {},
      soldCount: 9,
      daysAgoPublished: 80,
      returnable: false,
      shortDescription: "Sheer, light chinon for dupattas and layers.",
      variants: [
        {
          skuSuffix: "ROSE",
          colour: C.rose,
          pricePaise: 26000,
          stockDisplay: 0,
          lowStockDisplay: 5,
        },
        {
          skuSuffix: "IVRY",
          colour: C.ivory,
          pricePaise: 26000,
          stockDisplay: 0,
          lowStockDisplay: 5,
        },
      ],
    }),
    make({
      name: "Tissue fabric",
      category: "tissue-fabrics",
      unit: fabricUnit,
      fabricType: "tissue",
      material: "tissue",
      pattern: "plain",
      composition: "Metallic tissue",
      widthMm: cm(112),
      occasion: ["festive", "wedding"],
      tags: ["navratri"],
      flags: { bestseller: true },
      soldCount: 64,
      daysAgoPublished: 25,
      returnable: false,
      shortDescription: "Light metallic tissue with a crisp hand.",
      variants: [
        {
          skuSuffix: "GOLD",
          colour: C.gold,
          pricePaise: 45000,
          stockDisplay: 4,
          lowStockDisplay: 5,
        }, // low stock
        {
          skuSuffix: "ROSE",
          colour: C.rose,
          pricePaise: 45000,
          stockDisplay: 30,
          lowStockDisplay: 5,
        },
      ],
    }),
    make({
      name: "Lace border",
      category: "lace-and-borders",
      unit: laceUnit,
      fabricType: "lace",
      material: "cotton",
      pattern: "floral",
      flags: {},
      soldCount: 30,
      daysAgoPublished: 60,
      returnable: false,
      shortDescription: "Scalloped lace border, sold from one metre in 10 cm steps.",
      variants: [
        {
          skuSuffix: "IVRY",
          colour: C.ivory,
          pricePaise: 3500,
          stockDisplay: 100,
          lowStockDisplay: 10,
        },
        {
          skuSuffix: "GOLD",
          colour: C.gold,
          pricePaise: 4500,
          stockDisplay: 80,
          lowStockDisplay: 10,
        },
      ],
    }),
    make({
      name: "Tassel latkan",
      category: "latkan-and-tassels",
      unit: units.each("pair"),
      pattern: "tassel",
      flags: {},
      soldCount: 70,
      daysAgoPublished: 100,
      returnable: true,
      shortDescription: "Hand-knotted latkan, sold as a pair.",
      variants: [
        {
          skuSuffix: "GOLD",
          colour: C.gold,
          pricePaise: 8000,
          stockDisplay: 200,
          lowStockDisplay: 20,
        },
        {
          skuSuffix: "MADR",
          colour: C.madder,
          pricePaise: 8000,
          stockDisplay: 150,
          lowStockDisplay: 20,
        },
      ],
    })
  )

  // ---- Dupattas (each)
  const dupatta = (
    name: string,
    category: string,
    pattern: string,
    base: number,
    colours: Colour[],
    extra: Partial<ProductSpec> & { variantExtra?: Partial<VariantSpec> } = {}
  ) => {
    const { variantExtra, ...rest } = extra
    return make({
      name,
      category,
      unit: units.each("piece"),
      fabricType: "cotton", // each dupatta says which fabric it is made of
      pattern,
      occasion: ["festive"],
      flags: {},
      soldCount: 20,
      daysAgoPublished: 40,
      returnable: true,
      shortDescription: `${name}, ready to wear with any suit.`,
      variants: colours.map((colour, i) => ({
        skuSuffix: colour.name
          .toUpperCase()
          .replace(/[^A-Z]/g, "")
          .slice(0, 4),
        colour,
        pricePaise: base,
        stockDisplay: 12 + i * 4,
        lowStockDisplay: 3,
        ...variantExtra,
      })),
      ...rest,
    })
  }
  p.push(
    dupatta("Bandhani dupatta", "bandhani-dupattas", "bandhani", 159900, [C.madder, C.mustard], {
      fabricType: "gaji silk",
      tags: ["navratri"],
      flags: { bestseller: true, featured: true },
      soldCount: 95,
      variantExtra: {
        salePricePaise: 159900,
        saleStartsInDays: -10,
        saleEndsInDays: 20,
        pricePaise: 189900,
      },
    }),
    dupatta(
      "Gharchola bandhani dupatta",
      "bandhani-dupattas",
      "bandhani",
      219900,
      [C.madder, C.teal],
      {
        fabricType: "crepe",
        tags: ["navratri"],
        flags: { newArrival: true },
        daysAgoPublished: 3,
        soldCount: 5,
      }
    ),
    dupatta("Ajrakh dupatta", "ajrakh-dupattas", "ajrakh", 129900, [C.indigo, C.madder], {
      fabricType: "modal silk",
      tags: ["navratri"],
      soldCount: 48,
    }),
    dupatta("Ajrakh cotton stole", "ajrakh-dupattas", "ajrakh", 79900, [C.indigo], {
      fabricType: "cotton",
      soldCount: 33,
    }),
    dupatta("Floral print dupatta", "printed-dupattas", "floral", 69900, [C.rose, C.sage], {
      fabricType: "chinon",
      soldCount: 15,
    }),
    dupatta("Block print dupatta", "printed-dupattas", "block print", 89900, [C.teal, C.sand], {
      fabricType: "cotton",
      soldCount: 27,
    }),
    dupatta("Plain mulmul dupatta", "plain-dupattas", "plain", 49900, [C.ivory, C.rose, C.sage], {
      fabricType: "cotton",
      soldCount: 61,
      variantExtra: { compareAtPaise: 59900 },
    }),
    dupatta("Dyed chinon dupatta", "plain-dupattas", "plain", 59900, [C.plum, C.mustard], {
      fabricType: "chinon",
      soldCount: 11,
    })
  )

  // ---- Blouses, ready-made and unstitched (sizes or sets)
  const sized = (sizes: string[], price: number, stock = 10): VariantSpec[] =>
    sizes.map((size) => ({
      skuSuffix: size,
      size,
      pricePaise: price,
      stockDisplay: stock,
      lowStockDisplay: 2,
    }))
  const sizes = ["S", "M", "L", "XL"]
  for (const [name, fabricType, pattern, price, colour] of [
    ["Cotton blouse", "cotton", "plain", 79900, C.sage],
    ["Ajrakh blouse", "modal silk", "ajrakh", 99900, C.indigo],
    ["Tissue blouse", "tissue", "plain", 129900, C.gold],
    ["Bandhani blouse", "gaji silk", "bandhani", 109900, C.madder],
  ] as const) {
    p.push(
      make({
        name,
        category: "blouses",
        unit: units.each("piece"),
        fabricType,
        pattern,
        occasion: ["festive"],
        flags: name === "Tissue blouse" ? { newArrival: true } : {},
        soldCount: 10 + Math.round(price / 10000),
        daysAgoPublished: 20 + Math.round(price / 10000),
        returnable: true,
        shortDescription: `${name} with a comfortable fit, in sizes S to XL.`,
        variants: sized(sizes, price).map((v) => ({ ...v, colour })),
      })
    )
  }
  for (const [name, category, fabricType, pattern, price, colour] of [
    ["Cotton kurti", "kurtis", "cotton", "floral", 119900, C.teal],
    ["Straight kurti", "kurtis", "crepe", "plain", 99900, C.charcoal],
    ["Anarkali kurti", "kurtis", "chinon", "floral", 189900, C.plum],
    ["A-line kurti", "kurtis", "cotton", "block print", 139900, C.sand],
    ["Cotton summer dress", "dresses", "cotton", "floral", 169900, C.rose],
    ["Maxi dress", "dresses", "crepe", "plain", 219900, C.indigo],
    ["Wrap dress", "dresses", "modal silk", "floral", 189900, C.sage],
  ] as const) {
    p.push(
      make({
        name,
        category,
        unit: units.each("piece"),
        fabricType,
        pattern,
        occasion: ["everyday"],
        flags: name === "Anarkali kurti" ? { bestseller: true, featured: true } : {},
        soldCount: Math.round(price / 5000),
        daysAgoPublished: 15 + Math.round(price / 20000),
        returnable: true,
        shortDescription: `${name} in a relaxed everyday fit.`,
        variants: sized(sizes, price, name === "Maxi dress" ? 0 : 8).map((v) => ({ ...v, colour })),
      })
    )
  }
  for (const [name, fabricType, pattern, price, colour] of [
    ["Block print unstitched suit", "cotton", "block print", 149900, C.teal],
    ["Bandhani unstitched suit", "gaji silk", "bandhani", 199900, C.madder],
    ["Ajrakh unstitched suit", "modal silk", "ajrakh", 179900, C.indigo],
    ["Cotton unstitched suit", "cotton", "plain", 129900, C.sage],
  ] as const) {
    p.push(
      make({
        name,
        category: "unstitched-suits",
        unit: units.each("set", 5),
        fabricType,
        pattern,
        occasion: ["festive"],
        flags: name.startsWith("Block") ? { bestseller: true } : {},
        soldCount: Math.round(price / 4000),
        daysAgoPublished: 12 + Math.round(price / 15000),
        returnable: true,
        shortDescription: `Three-piece set: top, bottom and dupatta, unstitched.`,
        variants: [
          { skuSuffix: "SET", colour, pricePaise: price, stockDisplay: 15, lowStockDisplay: 3 },
        ],
      })
    )
  }
  return p
}

export function skuFor(productIndex: number, spec: ProductSpec, v: VariantSpec): string {
  return `DEMO-${String(productIndex + 1).padStart(3, "0")}-${v.skuSuffix}`.toUpperCase()
}
