import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { MongoMemoryReplSet } from "mongodb-memory-server"
import mongoose from "mongoose"
import { ROLES, roleHasPermission, type Permission, type Role } from "@/config/permissions"
import { ADMIN_SECTIONS } from "@/config/admin-nav"
import {
  couponInputSchema,
  productInputSchema,
  settingsInputSchema,
  variantInputSchema,
} from "@/features/admin/catalog-schemas"
import { ForbiddenError, ValidationError } from "@/lib/errors"
import { Category } from "@/models/category"
import { InventoryMovement } from "@/models/inventory-movement"
import { Product } from "@/models/product"
import { ProductVariant } from "@/models/product-variant"
import { Redirect } from "@/models/redirect"
import { AuditLog } from "@/models/audit-log"
import { User } from "@/models/user"
import {
  getProductAdmin,
  listCategoriesAdmin,
  listCollectionsAdmin,
  listProductsAdmin,
  saveCategory,
  saveCollection,
  saveProduct,
  saveVariant,
} from "@/services/admin-catalog-service"
import { getDashboardMetrics } from "@/services/admin-dashboard-service"
import {
  adjustStockAdmin,
  exportStockCsv,
  listAuditLog,
  listCoupons,
  listCustomers,
  listCustomersPage,
  listCouponsPage,
  listStockPage,
  listMovements,
  listStock,
  saveCoupon,
  saveSettings,
  getSettingsAdmin,
  listPaymentsForOrder,
} from "@/services/admin-ops-service"
import { listPagesAdmin, savePage } from "@/services/content-service"
import { getCommerceSettings } from "@/services/order-service"
import { resetDatabase, startDatabase, stopDatabase } from "./helpers"

vi.mock("server-only", () => ({}))

let replSet: MongoMemoryReplSet
const oid = () => String(new mongoose.Types.ObjectId())
const as = (role: Role) => ({ id: oid(), role })
const owner = as("super_admin")

beforeAll(async () => {
  replSet = await startDatabase("admin_test")
}, 240_000)
afterAll(() => stopDatabase(replSet))
beforeEach(resetDatabase)

/** Form values as the browser sends them, parsed by the real schemas. */
const product = (over: Record<string, string> = {}, categoryId = "0".repeat(24)) =>
  productInputSchema.parse({
    name: "Pure silk",
    status: "active",
    categoryId,
    tags: "silk, festive",
    returnable: "on",
    images: "",
    ...over,
  })
const variant = (over: Record<string, string> = {}) =>
  variantInputSchema.parse({
    sku: "silk-red",
    status: "active",
    kind: "length",
    price: "450",
    minQty: "0.5",
    stepQty: "0.5",
    lowStock: "2",
    initialStock: "10",
    colorName: "Red",
    colorHex: "#aa0000",
    ...over,
  })

async function setup() {
  const category = await saveCategory(owner, null, {
    name: "Silks",
    slug: undefined,
    parentId: undefined,
    description: undefined,
    sortOrder: 0,
    status: "active",
  })
  const saved = await saveProduct(owner, null, product({}, category.id))
  return { category, ...saved }
}

describe("permission matrix: every role against every admin operation", () => {
  const calls: [string, Permission, (a: { id: string; role: Role }) => Promise<unknown>][] = [
    ["list products", "catalog:read", (a) => listProductsAdmin(a)],
    ["list categories", "catalog:read", (a) => listCategoriesAdmin(a)],
    ["list collections", "catalog:read", (a) => listCollectionsAdmin(a)],
    ["save product", "catalog:write", (a) => saveProduct(a, null, product())],
    ["save variant", "catalog:write", (a) => saveVariant(a, oid(), null, variant())],
    [
      "save category",
      "catalog:write",
      (a) =>
        saveCategory(a, null, {
          name: "X Y",
          slug: undefined,
          parentId: undefined,
          description: undefined,
          sortOrder: 0,
          status: "active",
        }),
    ],
    [
      "save collection",
      "catalog:write",
      (a) =>
        saveCollection(a, null, {
          name: "Z Z",
          slug: undefined,
          description: undefined,
          type: "manual",
          productSlugs: [],
          ruleTag: undefined,
          ruleFlag: undefined,
          ruleCategoryId: undefined,
          status: "active",
        }),
    ],
    ["list stock", "inventory:read", (a) => listStock(a)],
    ["export stock", "inventory:read", (a) => exportStockCsv(a)],
    ["stock history", "inventory:read", (a) => listMovements(a, oid())],
    [
      "adjust stock",
      "inventory:adjust",
      (a) =>
        adjustStockAdmin(a, oid(), {
          mode: "add",
          amount: "1",
          reason: "test",
          idempotencyKey: oid(),
        }),
    ],
    ["list coupons", "coupons:manage", (a) => listCoupons(a)],
    [
      "save coupon",
      "coupons:manage",
      (a) =>
        saveCoupon(a, null, couponInputSchema.parse({ code: "ABC", type: "flat", amount: "10" })),
    ],
    ["list customers", "customers:read", (a) => listCustomers(a)],
    ["list staff", "users:manage_roles", (a) => listCustomers(a, { staffOnly: true })],
    ["read settings", "settings:write", (a) => getSettingsAdmin(a)],
    ["list pages", "content:write", (a) => listPagesAdmin(a)],
    [
      "save page",
      "content:write",
      (a) => savePage(a, "faq", { title: "FAQ", body: "Some real text here." }),
    ],
    ["read audit log", "auditlogs:read", (a) => listAuditLog(a)],
    ["read payments", "payments:read", (a) => listPaymentsForOrder(a, oid())],
  ]
  for (const [name, permission, run] of calls) {
    it(`${name} needs ${permission}`, async () => {
      for (const role of ROLES) {
        const allowed = roleHasPermission(role, permission)
        const outcome = await run(as(role)).then(
          () => "ok" as const,
          (e: unknown) =>
            e instanceof ForbiddenError ? ("forbidden" as const) : ("other" as const)
        )
        expect(outcome === "forbidden", `${role} / ${name}`).toBe(!allowed)
      }
    })
  }

  it("every menu entry names a permission some role holds, and customers hold none", () => {
    for (const s of ADMIN_SECTIONS) {
      if (!s.permission) continue
      expect(
        ROLES.some((r) => roleHasPermission(r, s.permission)),
        s.href
      ).toBe(true)
      expect(roleHasPermission("customer", s.permission), s.href).toBe(false)
    }
  })

  it("dashboard figures appear only for roles allowed to see them", async () => {
    const full = await getDashboardMetrics(owner)
    expect(Object.keys(full).sort()).toEqual(
      [
        "lowStock",
        "needsAttention",
        "ordersToday",
        "outOfStock",
        "returnsToHandle",
        "revenueTodayPaise",
        "revenueWeekPaise",
        "toShip",
      ].sort()
    )
    const catalog = await getDashboardMetrics(as("catalog_manager"))
    expect(Object.keys(catalog).sort()).toEqual(["lowStock", "outOfStock"])
    expect(await getDashboardMetrics(as("customer"))).toEqual({})
  })
})

describe("products and variants", () => {
  it("creates a product with variants, keeps the listing summary in step, and persists", async () => {
    const { id } = await setup()
    await saveVariant(owner, id, null, variant())
    await saveVariant(
      owner,
      id,
      null,
      variant({
        sku: "silk-blue",
        colorName: "Blue",
        colorHex: "#0000aa",
        price: "500",
        initialStock: "0",
      })
    )
    const { product: p, variants } = await getProductAdmin(owner, id)
    expect(p).toMatchObject({
      name: "Pure silk",
      slug: "pure-silk",
      status: "active",
      variantCount: 2,
      inStock: true,
      tags: ["silk", "festive"],
    })
    expect(p.priceRange).toMatchObject({ minPaise: 45000, maxPaise: 50000 })
    expect(p.publishedAt).toBeTruthy()
    expect(variants[0]).toMatchObject({
      sku: "SILK-RED",
      pricePaise: 45000,
      stock: { onHand: 10000, reserved: 0 },
      lowStockThreshold: 2000,
    })
    expect(variants[0]!.sellingUnit).toMatchObject({ kind: "length", minQty: 500, stepQty: 500 })
    expect((await listProductsAdmin(owner, { q: "silk" })).rows).toHaveLength(1)
    expect((await listProductsAdmin(owner, { status: "draft" })).rows).toHaveLength(0)
  })

  it("edits a product and leaves a redirect when the address changes", async () => {
    const { id, category } = await setup()
    await saveProduct(
      owner,
      id,
      product({ name: "Pure silk crepe", slug: "pure-silk-crepe", status: "active" }, category.id)
    )
    expect(await Redirect.findOne({ fromPath: "/products/pure-silk" }).lean()).toMatchObject({
      toPath: "/products/pure-silk-crepe",
      statusCode: 301,
    })
    expect((await Product.findById(id).lean())?.slug).toBe("pure-silk-crepe")
  })

  it("reports duplicate addresses, SKUs and unknown categories next to the field", async () => {
    const { id, category } = await setup()
    await expect(saveProduct(owner, null, product({}, category.id))).rejects.toMatchObject({
      details: [{ path: "slug" }],
    })
    await expect(saveProduct(owner, null, product({ name: "Other" }, oid()))).rejects.toMatchObject(
      { details: [{ path: "categoryId" }] }
    )
    await saveVariant(owner, id, null, variant())
    await expect(saveVariant(owner, id, null, variant())).rejects.toMatchObject({
      details: [{ path: "sku" }],
    })
  })

  it("rejects bad quantities, prices and mixed units", async () => {
    const { id } = await setup()
    await expect(saveVariant(owner, id, null, variant({ minQty: "0.5555" }))).rejects.toMatchObject(
      { details: [{ path: "minQty" }] }
    )
    await expect(
      saveVariant(owner, id, null, variant({ salePrice: "500" }))
    ).rejects.toBeInstanceOf(ValidationError) // sale above the price
    expect(() => variant({ price: "12.345" })).toThrow()
    expect(() => variant({ sku: "x" })).toThrow()
    await saveVariant(owner, id, null, variant())
    await expect(
      saveVariant(
        owner,
        id,
        null,
        variant({ sku: "silk-piece", kind: "piece", minQty: "1", stepQty: "1" })
      )
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it("editing a variant changes price and sale but never touches stock", async () => {
    const { id } = await setup()
    const { id: variantId } = await saveVariant(owner, id, null, variant())
    await saveVariant(
      owner,
      id,
      variantId,
      variant({
        price: "600",
        compareAt: "700",
        salePrice: "550",
        saleStartsAt: "2026-10-01",
        saleEndsAt: "2026-10-31",
        initialStock: "999",
      })
    )
    const v = (await ProductVariant.findById(variantId).lean())!
    expect(v).toMatchObject({ pricePaise: 60000, compareAtPaise: 70000, salePricePaise: 55000 })
    expect(v.stock.onHand).toBe(10000)
    await saveVariant(owner, id, variantId, variant({ price: "600" })) // sale and compare-at cleared
    const cleared = (await ProductVariant.findById(variantId).lean())!
    expect(cleared.salePricePaise).toBeUndefined()
    expect(cleared.compareAtPaise).toBeUndefined()
  })

  it("only accepts Cloudinary https images with a description", () => {
    expect(() => product({ images: "https://evil.example.com/a.jpg | A photo" })).toThrow()
    expect(() => product({ images: "http://res.cloudinary.com/a.jpg | A photo" })).toThrow()
    expect(() => product({ images: "https://res.cloudinary.com/a.jpg" })).toThrow()
    expect(
      product({ images: "https://res.cloudinary.com/demo/a.jpg | Red silk, folded" }).images
    ).toEqual([
      { url: "https://res.cloudinary.com/demo/a.jpg", alt: "Red silk, folded", sortOrder: 0 },
    ])
  })

  it("never lets a stored script through as a field: text stays text", async () => {
    const { category } = await setup()
    const saved = await saveProduct(
      owner,
      null,
      product({ name: "<script>alert(1)</script> silk", slug: "script-silk" }, category.id)
    )
    expect((await Product.findById(saved.id).lean())?.name).toBe("<script>alert(1)</script> silk") // escaped on output by React
  })
})

describe("categories and collections", () => {
  it("allows one level of nesting only and reports it", async () => {
    const parent = await saveCategory(owner, null, {
      name: "Fabrics",
      slug: undefined,
      parentId: undefined,
      description: undefined,
      sortOrder: 1,
      status: "active",
    })
    const child = await saveCategory(owner, null, {
      name: "Cotton",
      slug: undefined,
      parentId: parent.id,
      description: undefined,
      sortOrder: 1,
      status: "active",
    })
    expect((await Category.findById(child.id).lean())?.ancestors.map(String)).toEqual([parent.id])
    await expect(
      saveCategory(owner, null, {
        name: "Voile",
        slug: undefined,
        parentId: child.id,
        description: undefined,
        sortOrder: 1,
        status: "active",
      })
    ).rejects.toMatchObject({ details: [{ path: "parentId" }] })
    await expect(
      saveCategory(owner, parent.id, {
        name: "Fabrics",
        slug: undefined,
        parentId: child.id,
        description: undefined,
        sortOrder: 1,
        status: "active",
      })
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it("builds a manual collection from product addresses and refuses unknown ones", async () => {
    const { slug } = await setup()
    const ok = await saveCollection(owner, null, {
      name: "Festive",
      slug: undefined,
      description: undefined,
      type: "manual",
      productSlugs: [slug],
      ruleTag: undefined,
      ruleFlag: undefined,
      ruleCategoryId: undefined,
      status: "active",
    })
    expect(ok.id).toBeTruthy()
    await expect(
      saveCollection(owner, null, {
        name: "Broken",
        slug: undefined,
        description: undefined,
        type: "manual",
        productSlugs: ["nope"],
        ruleTag: undefined,
        ruleFlag: undefined,
        ruleCategoryId: undefined,
        status: "active",
      })
    ).rejects.toMatchObject({ details: [{ path: "productSlugs" }] })
    await expect(
      saveCollection(owner, null, {
        name: "Rule less",
        slug: undefined,
        description: undefined,
        type: "smart",
        productSlugs: [],
        ruleTag: undefined,
        ruleFlag: undefined,
        ruleCategoryId: undefined,
        status: "active",
      })
    ).rejects.toBeInstanceOf(ValidationError)
  })
})

describe("stock", () => {
  async function stocked() {
    const { id } = await setup()
    const { id: variantId } = await saveVariant(owner, id, null, variant())
    return variantId
  }
  it("adds, removes and sets stock in metres, with a record of who and why", async () => {
    const v = await stocked()
    await adjustStockAdmin(owner, v, {
      mode: "add",
      amount: "5",
      reason: "New roll",
      idempotencyKey: "k1",
    })
    await adjustStockAdmin(owner, v, {
      mode: "remove",
      amount: "1.5",
      reason: "Damaged edge",
      idempotencyKey: "k2",
    })
    await adjustStockAdmin(owner, v, {
      mode: "set",
      amount: "20",
      reason: "Recount",
      idempotencyKey: "k3",
    })
    expect((await ProductVariant.findById(v).lean())?.stock.onHand).toBe(20000)
    const moves = await listMovements(owner, v)
    expect(moves.map((m) => [m.type, m.deltaOnHand])).toEqual([
      ["correction", 6500],
      ["wastage", -1500],
      ["restock", 5000],
    ])
    expect(String(moves[0]!.actorId)).toBe(owner.id)
  })
  it("applies a double-click once and refuses nonsense", async () => {
    const v = await stocked()
    await adjustStockAdmin(owner, v, {
      mode: "add",
      amount: "1",
      reason: "Roll",
      idempotencyKey: "same",
    })
    await adjustStockAdmin(owner, v, {
      mode: "add",
      amount: "1",
      reason: "Roll",
      idempotencyKey: "same",
    })
    expect((await ProductVariant.findById(v).lean())?.stock.onHand).toBe(11000)
    await expect(
      adjustStockAdmin(owner, v, {
        mode: "add",
        amount: "1.2345",
        reason: "Roll",
        idempotencyKey: "a",
      })
    ).rejects.toMatchObject({ details: [{ path: "amount" }] })
    await expect(
      adjustStockAdmin(owner, v, { mode: "add", amount: "1", reason: " ", idempotencyKey: "b" })
    ).rejects.toMatchObject({ details: [{ path: "reason" }] })
    await expect(
      adjustStockAdmin(owner, v, {
        mode: "remove",
        amount: "500",
        reason: "Too much",
        idempotencyKey: "c",
      })
    ).rejects.toBeInstanceOf(ValidationError)
    await expect(
      adjustStockAdmin(owner, v, { mode: "set", amount: "11", reason: "Same", idempotencyKey: "d" })
    ).rejects.toMatchObject({ details: [{ path: "amount" }] })
    expect(await InventoryMovement.countDocuments({ variantId: v })).toBe(1)
  })
  it("lists low and out-of-stock items and exports a spreadsheet safe from formula tricks", async () => {
    const v = await stocked()
    expect(await listStock(owner, { show: "low" })).toHaveLength(0)
    await adjustStockAdmin(owner, v, {
      mode: "set",
      amount: "1.5",
      reason: "Almost gone",
      idempotencyKey: "x1",
    })
    expect((await listStock(owner, { show: "low" })).map((r) => r.sku)).toEqual(["SILK-RED"])
    await adjustStockAdmin(owner, v, {
      mode: "set",
      amount: "0.5",
      reason: "Nearly out",
      idempotencyKey: "x2",
    })
    await ProductVariant.updateOne({ _id: v }, { $set: { "stock.onHand": 0 } })
    expect((await listStock(owner, { show: "out" })).map((r) => r.sku)).toEqual(["SILK-RED"])
    await Product.updateMany({}, { $set: { name: '=HYPERLINK("http://x","click")' } })
    const csv = await exportStockCsv(owner)
    expect(csv.split("\n")[0]).toBe("SKU,Product,Option,On hand,Held for orders,Available,Status")
    expect(csv).toContain(`"'=HYPERLINK(""http://x"",""click"")"`)
  })
})

describe("coupons, settings, people and the audit log", () => {
  it("creates and edits coupons with plain-language errors", async () => {
    const parse = (o: Record<string, string>) =>
      couponInputSchema.parse({ code: "diwali10", type: "percent", percent: "10", ...o })
    const { id } = await saveCoupon(
      owner,
      null,
      parse({ minOrder: "500", maxDiscount: "200", usageLimit: "100" })
    )
    await saveCoupon(owner, id, parse({ percent: "15", active: "on" }))
    const [c] = await listCoupons(owner)
    expect(c).toMatchObject({ code: "DIWALI10", percent: 15, active: true, perUserLimit: 1 })
    await expect(saveCoupon(owner, null, parse({}))).rejects.toMatchObject({
      details: [{ path: "code" }],
    })
    await expect(
      saveCoupon(owner, null, parse({ code: "NOPE", percent: "150" }))
    ).rejects.toMatchObject({ details: [{ path: "percent" }] })
    await expect(
      saveCoupon(owner, null, parse({ code: "FLAT", type: "flat", amount: "" }))
    ).rejects.toMatchObject({ details: [{ path: "amount" }] })
    await expect(
      saveCoupon(
        owner,
        null,
        parse({ code: "DATES", startsAt: "2026-10-10", endsAt: "2026-10-01" })
      )
    ).rejects.toMatchObject({ details: [{ path: "endsAt" }] })
  })

  it("settings changes reach checkout", async () => {
    const input = (o: Record<string, string> = {}) =>
      settingsInputSchema.parse({
        storeName: "Ambar",
        flatShipping: "100",
        freeShippingFrom: "2000",
        returnWindowDays: "10",
        reservationMinutes: "30",
        taxMode: "inclusive",
        taxRate: "5",
        ...o,
      })
    await saveSettings(owner, input())
    expect(await getCommerceSettings()).toMatchObject({
      shipping: { flatRatePaise: 10000, freeThresholdPaise: 200000 },
      returnWindowDays: 10,
      reservationMinutes: 30,
      tax: { enabled: false },
    })
    await saveSettings(
      owner,
      input({ freeShippingFrom: "", taxEnabled: "on", taxMode: "exclusive" })
    )
    const s = await getCommerceSettings()
    expect(s.shipping.freeThresholdPaise).toBeUndefined()
    expect(s.tax).toMatchObject({ enabled: true, mode: "exclusive" })
    await expect(saveSettings(owner, input({ reservationMinutes: "2" }))).rejects.toMatchObject({
      details: [{ path: "reservationMinutes" }],
    })
    await expect(saveSettings(owner, input({ announcementEnabled: "on" }))).rejects.toMatchObject({
      details: [{ path: "announcementText" }],
    })
    await expect(
      saveSettings(
        owner,
        input({ announcementText: "Sale", announcementHref: "https://evil.example" })
      )
    ).rejects.toMatchObject({ details: [{ path: "announcementHref" }] })
  })

  it("lists customers and staff separately, hides deleted accounts, and searches safely", async () => {
    await User.create([
      { email: "a@example.com", name: "Asha", role: "customer" },
      { email: "b@example.com", name: "Bina", role: "support" },
      { email: "gone@example.com", name: "Gone", role: "customer", status: "deleted" },
    ])
    expect((await listCustomers(owner)).map((u) => u.email).sort()).toEqual([
      "a@example.com",
      "b@example.com",
    ])
    expect((await listCustomers(owner, { staffOnly: true })).map((u) => u.email)).toEqual([
      "b@example.com",
    ])
    expect((await listCustomers(owner, { q: "asha" })).map((u) => u.email)).toEqual([
      "a@example.com",
    ])
    expect(await listCustomers(owner, { q: ".*" })).toHaveLength(0) // a pattern typed as search text is matched literally
  })

  it("records every change in the audit log, newest first, filterable", async () => {
    const { id } = await setup()
    await saveVariant(owner, id, null, variant())
    const all = await listAuditLog(owner)
    expect(all.rows.map((r) => r.action)).toEqual(
      expect.arrayContaining(["category.created", "product.created", "variant.created"])
    )
    expect(all.rows[0]!.at >= all.rows.at(-1)!.at).toBe(true)
    expect(
      (await listAuditLog(owner, { action: "product." })).rows.every((r) =>
        r.action.startsWith("product.")
      )
    ).toBe(true)
    expect(await AuditLog.countDocuments({ actorId: owner.id })).toBeGreaterThan(0)
  })
})

describe("paged lists", () => {
  it("page through customers, stock and coupons with a total", async () => {
    await User.create(
      Array.from({ length: 30 }, (_, i) => ({
        email: `p${i}@example.com`,
        name: `Person ${i}`,
        role: "customer" as const,
      }))
    )
    const one = await listCustomersPage(owner, { page: 1 })
    const two = await listCustomersPage(owner, { page: 2 })
    expect([one.rows.length, two.rows.length, one.total, one.pageSize]).toEqual([25, 5, 30, 25])
    expect(new Set([...one.rows, ...two.rows].map((r) => r.id)).size).toBe(30)
    expect((await listCustomersPage(owner, { q: "Person 1", page: 1 })).total).toBe(11)
    expect((await listCustomersPage(owner, { page: 99 })).rows).toEqual([])
    expect((await listCustomersPage(owner, { page: -3 })).rows).toHaveLength(25) // a bad page number is page 1

    const { id } = await setup()
    for (let i = 0; i < 27; i++)
      await saveVariant(owner, id, null, variant({ sku: `page-${i}`, initialStock: "5" }))
    const stock = await listStockPage(owner, { page: 2 })
    expect([stock.rows.length, stock.total]).toEqual([2, 27])

    for (let i = 0; i < 26; i++)
      await saveCoupon(
        owner,
        null,
        couponInputSchema.parse({ code: `CODE${i}`, type: "flat", amount: "10" })
      )
    const coupons = await listCouponsPage(owner, 2)
    expect([coupons.rows.length, coupons.total]).toEqual([1, 26])
  })

  it("needs the same permission as the unpaged lists", async () => {
    await expect(listCustomersPage(as("catalog_manager"))).rejects.toBeInstanceOf(ForbiddenError)
    await expect(listStockPage(as("support"))).resolves.toBeTruthy()
    await expect(listCouponsPage(as("support"))).rejects.toBeInstanceOf(ForbiddenError)
  })
})
