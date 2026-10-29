import { z } from "zod"
import { SLUG_PATTERN } from "@/lib/slug"

/** Form values arrive as strings. Checkboxes are absent when off and "on" when ticked. */
const checkbox = z
  .enum(["on", "true", "false"])
  .optional()
  .transform((v) => v === "on" || v === "true")
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters.`)
    .optional()
    .transform((v) => (v ? v : undefined))
const objectId = z.string().regex(/^[0-9a-f]{24}$/, "Choose one.")
const csv = (max: number, each = 40) =>
  z
    .string()
    .optional()
    .transform((v) =>
      (v ?? "")
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
    )
    .refine((a) => a.length <= max, `At most ${max} entries.`)
    .refine(
      (a) => a.every((t) => t.length <= each),
      `Each entry can be at most ${each} characters.`
    )

/** One image per line as "https://res.cloudinary.com/... | description for people who cannot see it". */
const imageLines = z
  .string()
  .optional()
  .transform((v, ctx) => {
    const out: { url: string; alt: string; sortOrder: number }[] = []
    for (const [i, line] of (v ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .entries()) {
      const [url = "", ...rest] = line.split("|").map((p) => p.trim())
      const alt = rest.join(" | ")
      let host = ""
      try {
        const parsed = new URL(url)
        host = parsed.protocol === "https:" ? parsed.hostname : ""
      } catch {
        host = ""
      }
      if (host !== "res.cloudinary.com") {
        ctx.addIssue({
          code: "custom",
          message: `Image ${i + 1}: use an https://res.cloudinary.com address.`,
        })
        return z.NEVER
      }
      if (alt.length < 3) {
        ctx.addIssue({
          code: "custom",
          message: `Image ${i + 1}: add a description after a | sign.`,
        })
        return z.NEVER
      }
      out.push({ url: url.slice(0, 500), alt: alt.slice(0, 200), sortOrder: i })
    }
    if (out.length > 12) {
      ctx.addIssue({ code: "custom", message: "At most 12 images." })
      return z.NEVER
    }
    return out
  })

export const productInputSchema = z.object({
  name: z.string().trim().min(2, "Enter a name.").max(140, "Use at most 140 characters."),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .max(80)
    .regex(SLUG_PATTERN, "Use lowercase letters, numbers and single hyphens.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  status: z.enum(["draft", "active", "archived"]),
  categoryId: objectId,
  shortDescription: optionalText(300),
  description: optionalText(5000),
  tags: csv(20),
  returnable: checkbox,
  featured: checkbox,
  bestseller: checkbox,
  newArrival: checkbox,
  /** Chosen from the master lists (Admin, Fabrics and Prints). */
  fabricId: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => !v || /^[0-9a-f]{24}$/.test(v), "Choose one from the list."),
  printId: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => !v || /^[0-9a-f]{24}$/.test(v), "Choose one from the list."),
  material: optionalText(60),
  composition: optionalText(200),
  widthCm: z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) return undefined
      if (!/^\d{1,4}$/.test(v)) {
        ctx.addIssue({ code: "custom", message: "Enter the width in whole centimetres." })
        return z.NEVER
      }
      return Number(v) * 10
    }),
  careInstructions: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? "")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 10)
    ),
  origin: optionalText(80),
  occasion: csv(10),
  hsnCode: optionalText(10),
  taxRatePercent: z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) return undefined
      const n = Number(v)
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        ctx.addIssue({ code: "custom", message: "Enter a rate from 0 to 100." })
        return z.NEVER
      }
      return n
    }),
  weightGrams: z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) return undefined
      if (!/^\d{1,6}$/.test(v) || Number(v) < 1) {
        ctx.addIssue({ code: "custom", message: "Enter the weight in whole grams." })
        return z.NEVER
      }
      return Number(v)
    }),
  images: imageLines,
  seoTitle: optionalText(120),
  seoDescription: optionalText(320),
})
export type ProductInput = z.infer<typeof productInputSchema>

const money = (label: string, required: boolean) =>
  z
    .string()
    .trim()
    .optional()
    .superRefine((v, ctx) => {
      if (!v) {
        if (required) ctx.addIssue({ code: "custom", message: `Enter ${label}.` })
        return
      }
      if (!/^\d{1,7}(\.\d{1,2})?$/.test(v))
        ctx.addIssue({ code: "custom", message: "Enter rupees, like 180 or 180.50." })
    })
const quantityText = (label: string, required: boolean) =>
  z
    .string()
    .trim()
    .optional()
    .superRefine((v, ctx) => {
      if (!v && required) ctx.addIssue({ code: "custom", message: `Enter ${label}.` })
    })
const dateText = z
  .string()
  .trim()
  .optional()
  .superRefine((v, ctx) => {
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v))
      ctx.addIssue({ code: "custom", message: "Use a date like 2026-10-31." })
  })

export const variantInputSchema = z.object({
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9._-]{1,39}$/, "2 to 40 letters, numbers, dots, dashes or underscores."),
  status: z.enum(["active", "inactive"]),
  colorName: optionalText(40),
  colorHex: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => !v || /^#[0-9a-fA-F]{6}$/.test(v), "Use a colour like #4b5e45."),
  size: optionalText(40),
  kind: z.enum(["length", "piece", "set", "pair", "pack"]),
  price: money("a price", true),
  compareAt: money("", false),
  /** What the shop paid per metre (or per piece). Only used for people allowed to see costs. */
  purchasePrice: money("", false),
  salePrice: money("", false),
  saleStartsAt: dateText,
  saleEndsAt: dateText,
  minQty: quantityText("a minimum", false),
  stepQty: quantityText("a step", false),
  maxQty: quantityText("", false),
  lowStock: quantityText("", false),
  initialStock: quantityText("", false),
  weightGrams: z
    .string()
    .trim()
    .optional()
    .superRefine((v, ctx) => {
      if (v && (!/^\d{1,6}$/.test(v) || Number(v) < 1))
        ctx.addIssue({ code: "custom", message: "Whole grams." })
    }),
})
export type VariantInput = z.infer<typeof variantInputSchema>

/** A variant typed into the new-product form: the code may be left blank and is then made for you. */
export const variantDraftSchema = variantInputSchema.extend({
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .refine(
      (v) => v === "" || /^[A-Z0-9][A-Z0-9._-]{1,39}$/.test(v),
      "2 to 40 letters, numbers, dots, dashes or underscores."
    ),
})

export const categoryInputSchema = z.object({
  name: z.string().trim().min(2, "Enter a name.").max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .max(80)
    .regex(SLUG_PATTERN, "Use lowercase letters, numbers and single hyphens.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  parentId: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => !v || /^[0-9a-f]{24}$/.test(v), "Choose one."),
  description: optionalText(2000),
  sortOrder: z
    .string()
    .trim()
    .optional()
    .transform((v) => Number(v || 0))
    .refine((n) => Number.isInteger(n) && n >= 0 && n < 10000, "Enter a whole number."),
  status: z.enum(["active", "hidden"]),
})
export type CategoryInput = z.infer<typeof categoryInputSchema>

export const collectionInputSchema = z.object({
  name: z.string().trim().min(2, "Enter a name.").max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .max(80)
    .regex(SLUG_PATTERN, "Use lowercase letters, numbers and single hyphens.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  description: optionalText(2000),
  type: z.enum(["manual", "smart"]),
  /** Manual: product slugs, one per line or comma separated. */
  productSlugs: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? "")
        .split(/[\n,]/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    ),
  /** Smart: a tag, or a flag, or a category. */
  ruleTag: optionalText(60),
  ruleFlag: z
    .enum(["", "featured", "bestseller", "newArrival"])
    .optional()
    .transform((v) => v || undefined),
  ruleCategoryId: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => !v || /^[0-9a-f]{24}$/.test(v), "Choose one."),
  status: z.enum(["active", "hidden"]),
})
export type CollectionInput = z.infer<typeof collectionInputSchema>

export const couponInputSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{3,30}$/, "3 to 30 letters, numbers, dashes or underscores."),
  description: optionalText(200),
  type: z.enum(["percent", "flat"]),
  percent: z.string().trim().optional(),
  amount: money("an amount", false),
  maxDiscount: money("", false),
  minOrder: money("", false),
  startsAt: dateText,
  endsAt: dateText,
  usageLimit: z.string().trim().optional(),
  perUserLimit: z.string().trim().optional(),
  active: checkbox,
  showOnHome: checkbox,
})
export type CouponInput = z.infer<typeof couponInputSchema>

export const settingsInputSchema = z.object({
  storeName: z.string().trim().min(2).max(80),
  storeEmail: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), "Enter a valid email address."),
  storePhone: optionalText(20),
  legalName: optionalText(120),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .refine(
      (v) => !v || /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/.test(v),
      "A GSTIN is 15 characters, like 24ABCDE1234F1Z5."
    ),
  storeAddress: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? "")
        .split("\n")
        .map((l) => l.trim().slice(0, 120))
        .filter(Boolean)
        .slice(0, 6)
    ),
  freeShippingFrom: money("", false),
  flatShipping: money("a shipping charge", true),
  returnWindowDays: z
    .string()
    .trim()
    .regex(/^\d{1,2}$/, "Whole days, 0 to 99."),
  reservationMinutes: z
    .string()
    .trim()
    .regex(/^\d{1,3}$/, "Whole minutes."),
  taxEnabled: checkbox,
  taxMode: z.enum(["inclusive", "exclusive"]),
  taxRate: z
    .string()
    .trim()
    .regex(/^\d{1,2}(\.\d{1,2})?$/, "A rate from 0 to 99.99."),
  announcementEnabled: checkbox,
  announcementText: optionalText(200),
  announcementHref: optionalText(300),
})
export type SettingsInput = z.infer<typeof settingsInputSchema>
