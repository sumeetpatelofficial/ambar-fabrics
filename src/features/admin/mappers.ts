import { baseToDisplayString } from "@/lib/measure"
import { paiseToRupeeString } from "@/lib/money"
import type { CategoryDoc } from "@/models/category"
import type { CollectionDoc } from "@/models/collection"
import type { CouponDoc } from "@/models/coupon"
import type { ProductDoc } from "@/models/product"
import type { ProductVariantDoc } from "@/models/product-variant"
import type { SiteSettingsDoc } from "@/models/site-settings"

/** Plain string values for the forms: nothing from the database (ids, dates) crosses to the browser as an object. */
export type FormValues = Record<string, string>

const day = (d?: Date) =>
  d ? new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10) : ""
const rupees = (p?: number | null) => (p === undefined || p === null ? "" : paiseToRupeeString(p))

export function productToForm(p: ProductDoc): FormValues {
  return {
    name: p.name,
    slug: p.slug,
    status: p.status,
    categoryId: String(p.categoryIds[0] ?? ""),
    shortDescription: p.shortDescription ?? "",
    description: p.description ?? "",
    tags: p.tags.join(", "),
    returnable: p.returnable ? "on" : "",
    featured: p.flags.featured ? "on" : "",
    bestseller: p.flags.bestseller ? "on" : "",
    newArrival: p.flags.newArrival ? "on" : "",
    fabricId: p.fabricId ? String(p.fabricId) : "",
    printId: p.printId ? String(p.printId) : "",
    material: p.attributes.material ?? "",
    composition: p.attributes.composition ?? "",
    widthCm: p.attributes.widthMm ? String(p.attributes.widthMm / 10) : "",
    careInstructions: p.attributes.careInstructions.join("\n"),
    origin: p.attributes.origin ?? "",
    occasion: p.attributes.occasion.join(", "),
    hsnCode: p.hsnCode ?? "",
    taxRatePercent:
      p.taxRatePercent === null || p.taxRatePercent === undefined ? "" : String(p.taxRatePercent),
    weightGrams: p.weightGrams ? String(p.weightGrams) : "",
    images: p.images.map((i) => `${i.url} | ${i.alt}`).join("\n"),
    seoTitle: p.seo?.title ?? "",
    seoDescription: p.seo?.description ?? "",
  }
}

export function variantToForm(v: ProductVariantDoc, showCost = false): FormValues {
  const u = v.sellingUnit
  return {
    variantId: String(v._id),
    sku: v.sku,
    status: v.status,
    colorName: v.options?.colorName ?? "",
    colorHex: v.options?.colorHex ?? "",
    size: v.options?.size ?? "",
    kind: u.kind,
    price: rupees(v.pricePaise),
    ...(showCost ? { purchasePrice: rupees(v.costPaise) } : {}),
    compareAt: rupees(v.compareAtPaise),
    salePrice: rupees(v.salePricePaise),
    saleStartsAt: day(v.saleStartsAt),
    saleEndsAt: day(v.saleEndsAt),
    minQty: baseToDisplayString(u, u.minQty),
    stepQty: baseToDisplayString(u, u.stepQty),
    maxQty: u.maxQtyPerOrder ? baseToDisplayString(u, u.maxQtyPerOrder) : "",
    lowStock: baseToDisplayString(u, v.lowStockThreshold),
    weightGrams: v.weightGrams ? String(v.weightGrams) : "",
  }
}

export const emptyVariantForm: FormValues = {
  status: "active",
  kind: "length",
  minQty: "0.5",
  stepQty: "0.5",
  lowStock: "2",
}

export function categoryToForm(c: CategoryDoc): FormValues {
  return {
    id: String(c._id),
    name: c.name,
    slug: c.slug,
    parentId: c.parentId ? String(c.parentId) : "",
    description: c.description ?? "",
    sortOrder: String(c.sortOrder),
    status: c.status,
  }
}

export function collectionToForm(c: CollectionDoc & { productSlugs: string[] }): FormValues {
  return {
    id: String(c._id),
    name: c.name,
    slug: c.slug,
    description: c.description ?? "",
    type: c.type,
    productSlugs: c.productSlugs.join("\n"),
    ruleTag: c.rule?.tag ?? "",
    ruleFlag: c.rule?.flag ?? "",
    ruleCategoryId: c.rule?.categoryId ? String(c.rule.categoryId) : "",
    status: c.status,
  }
}

export function couponToForm(c: CouponDoc): FormValues {
  return {
    id: String(c._id),
    code: c.code,
    description: c.description ?? "",
    type: c.type,
    percent: c.percent !== undefined ? String(c.percent) : "",
    amount: rupees(c.amountPaise),
    maxDiscount: rupees(c.maxDiscountPaise),
    minOrder: c.minOrderPaise ? rupees(c.minOrderPaise) : "",
    startsAt: day(c.startsAt),
    endsAt: day(c.endsAt),
    usageLimit: c.usageLimit ? String(c.usageLimit) : "",
    perUserLimit: String(c.perUserLimit),
    active: c.active ? "on" : "",
    showOnHome: c.showOnHome ? "on" : "",
  }
}

export function settingsToForm(s: SiteSettingsDoc | null): FormValues {
  return {
    storeName: s?.store.name ?? "Ambar",
    storeEmail: s?.store.email ?? "",
    storePhone: s?.store.phone ?? "",
    legalName: s?.store.legalName ?? "",
    gstin: s?.store.gstin ?? "",
    storeAddress: (s?.store.addressLines ?? []).join("\n"),
    flatShipping: rupees(s?.shipping.flatRatePaise ?? 8000),
    freeShippingFrom: rupees(s ? s.shipping.freeThresholdPaise : 150000),
    returnWindowDays: String(s?.orders.returnWindowDays ?? 7),
    reservationMinutes: String(s?.inventory.reservationMinutes ?? 20),
    taxEnabled: s?.tax.enabled ? "on" : "",
    taxMode: s?.tax.mode ?? "inclusive",
    taxRate: String(s?.tax.defaultRatePercent ?? 5),
    announcementEnabled: s?.announcement.enabled ? "on" : "",
    announcementText: s?.announcement.text ?? "",
    announcementHref: s?.announcement.href ?? "",
  }
}
