import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { MongoMemoryReplSet } from "mongodb-memory-server"
import mongoose from "mongoose"
import {
  productInputSchema,
  variantDraftSchema,
  variantInputSchema,
} from "@/features/admin/catalog-schemas"
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors"
import { Address } from "@/models/address"
import { Category } from "@/models/category"
import { Order, type OrderDoc } from "@/models/order"
import { Product } from "@/models/product"
import { ProductVariant, type ProductVariantDoc } from "@/models/product-variant"
import { SiteSettings } from "@/models/site-settings"
import {
  createProductWithVariants,
  dryRunVariant,
  getProductAdmin,
  saveVariant,
} from "@/services/admin-catalog-service"
import { getOverview } from "@/services/admin-dashboard-service"
import { addToCart } from "@/services/cart-service"
import { ensureInvoice, getInvoiceForStaff, getInvoiceForUser } from "@/services/invoice-service"
import { createCheckout, markPaymentCaptured } from "@/services/order-service"
import { seedSampleCatalog } from "../../scripts/lib/seed-catalog"
import { resetDatabase, startDatabase, stopDatabase } from "./helpers"

vi.mock("server-only", () => ({}))

let replSet: MongoMemoryReplSet
const NOW = new Date("2026-10-14T06:00:00Z")
const oid = () => String(new mongoose.Types.ObjectId())
const owner = { id: oid(), role: "super_admin" as const }
const admin = { id: oid(), role: "admin" as const }
const manager = { id: oid(), role: "catalog_manager" as const }
const support = { id: oid(), role: "support" as const }
let key = 0
const idem = () => `cost-key-${String(++key).padStart(8, "0")}-abcdefgh`

beforeAll(async () => {
  replSet = await startDatabase("costs_test")
}, 240_000)
afterAll(() => stopDatabase(replSet))
beforeEach(async () => {
  await resetDatabase()
  await seedSampleCatalog(NOW)
})

const product = (o: Record<string, string> = {}, categoryId = "") =>
  productInputSchema.parse({
    name: "Wine silk",
    status: "active",
    categoryId,
    returnable: "on",
    ...o,
  })
const draft = (o: Record<string, string> = {}) =>
  variantDraftSchema.parse({
    status: "active",
    kind: "length",
    price: "450",
    purchasePrice: "312.34",
    initialStock: "10",
    minQty: "0.5",
    stepQty: "0.5",
    lowStock: "2",
    colorName: "Wine",
    colorHex: "#722f37",
    sku: "",
    ...o,
  })

async function category() {
  return String((await Category.create({ name: "Silks", slug: `silks-${oid().slice(-4)}` }))._id)
}

describe("purchase price and profit", () => {
  it("stores what was paid, and only people allowed to see costs read or change it", async () => {
    const categoryId = await category()
    const made = await createProductWithVariants(owner, product({}, categoryId), [draft()])
    const own = await getProductAdmin(owner, made.id)
    expect(own.variants[0]!.costPaise).toBe(31234)
    expect((await getProductAdmin(admin, made.id)).variants[0]!.costPaise).toBe(31234)
    // A catalogue manager sees the product but the cost is removed in the service, not just hidden on the page.
    expect((await getProductAdmin(manager, made.id)).variants[0]!.costPaise).toBeUndefined()
    expect((await getProductAdmin(support, made.id)).variants[0]!.costPaise).toBeUndefined()

    // A manager editing the price does not wipe or change the cost they cannot see.
    const v = own.variants[0]!
    await saveVariant(
      manager,
      made.id,
      String(v._id),
      variantInputSchema.parse({
        sku: v.sku,
        status: "active",
        kind: "length",
        price: "480",
        purchasePrice: "1",
        minQty: "0.5",
        stepQty: "0.5",
      })
    )
    const after = (await ProductVariant.findById(v._id).lean())!
    expect(after.pricePaise).toBe(48000)
    expect(after.costPaise).toBe(31234)
    // The owner can clear it.
    await saveVariant(
      owner,
      made.id,
      String(v._id),
      variantInputSchema.parse({
        sku: v.sku,
        status: "active",
        kind: "length",
        price: "480",
        minQty: "0.5",
        stepQty: "0.5",
      })
    )
    expect((await ProductVariant.findById(v._id).lean())!.costPaise).toBeUndefined()
  })

  it("never reaches the shop: the public product data has no cost", async () => {
    const categoryId = await category()
    const made = await createProductWithVariants(
      owner,
      product({ slug: "cost-leak-check" }, categoryId),
      [draft()]
    )
    const { getProductDetail } = await import("@/services/catalog-service")
    const detail = await getProductDetail(made.slug)
    expect(JSON.stringify(detail)).not.toMatch(/costPaise|purchase|31234|312\.34/i)
  })

  async function sell(variantId: string, qtyMm: number) {
    const userId = oid()
    const address = await Address.create({
      userId,
      fullName: "Meera Shah",
      phone: "9876543210",
      line1: "1 Road",
      city: "Surat",
      state: "Gujarat",
      pincode: "395003",
    })
    await addToCart(userId, variantId, qtyMm)
    const s = await createCheckout({
      userId,
      email: `${userId}@example.com`,
      addressId: String(address._id),
      idempotencyKey: idem(),
      now: NOW,
    })
    await markPaymentCaptured({
      gatewayOrderId: s.gatewayOrderId,
      paymentId: `pay_${idem()}`,
      amountPaise: s.amountPaise,
    })
    return { userId, orderNumber: s.orderNumber }
  }

  it("the order remembers what the goods cost at the time, and profit follows", async () => {
    const categoryId = await category()
    const made = await createProductWithVariants(owner, product({}, categoryId), [draft()])
    const v = (await ProductVariant.findOne({ productId: made.id }).lean<ProductVariantDoc>())!
    const { orderNumber } = await sell(String(v._id), 2500) // 2.5 m: sells 1,125, cost 750
    const order = (await Order.findOne({ orderNumber }).lean<OrderDoc>())!
    expect(order.items[0]).toMatchObject({ linePaise: 112500, costLinePaise: 78085 })
    // Changing the cost later does not rewrite history.
    await ProductVariant.updateOne({ _id: v._id }, { $set: { costPaise: 99999 } })
    expect((await Order.findOne({ orderNumber }).lean<OrderDoc>())!.items[0]!.costLinePaise).toBe(
      78085
    )

    const o = await getOverview(owner, "30d", new Date())
    expect(o.kpis!.profit!.value.value).toBe(112500 - 78085)
    expect(o.kpis!.profit!.coveredPct).toBe(100)
  })

  it("says how much of the sales the profit covers when some goods have no purchase price", async () => {
    const categoryId = await category()
    const made = await createProductWithVariants(owner, product({}, categoryId), [
      draft(),
      draft({ colorName: "Sand", colorHex: "#d9c7a3", purchasePrice: "" }),
    ])
    const [known, unknown] = await ProductVariant.find({ productId: made.id })
      .sort({ sortOrder: 1 })
      .lean<ProductVariantDoc[]>()
    await sell(String(known!._id), 1000)
    await sell(String(unknown!._id), 1000)
    const profit = (await getOverview(owner, "30d", new Date())).kpis!.profit!
    expect(profit.value.value).toBe(45000 - 31234) // only the item with a known cost
    expect(profit.coveredPct).toBe(50)
  })

  it("profit is shown only to roles that may see costs", async () => {
    const withCosts = await getOverview(admin, "30d", NOW)
    expect(withCosts.kpis!.profit).toBeDefined()
    // A role that may see sales figures but not costs gets sales and no profit.
    const salesOnly = await getOverview({ id: oid(), role: "fulfillment_manager" }, "30d", NOW)
    expect(salesOnly.kpis).toBeDefined()
    expect(salesOnly.kpis!.profit).toBeUndefined()
    expect((await getOverview(support, "30d", NOW)).kpis).toBeUndefined() // no money figures at all
  })
})

describe("making a product with its colours in one step", () => {
  it("creates the product, every colour with price, cost and stock, and makes the codes", async () => {
    const categoryId = await category()
    const made = await createProductWithVariants(
      owner,
      product({ slug: "wine-silk" }, categoryId),
      [draft(), draft({ colorName: "Ivory", colorHex: "#f5efe0", initialStock: "5.5" })]
    )
    const variants = await ProductVariant.find({ productId: made.id })
      .sort({ sortOrder: 1 })
      .lean<ProductVariantDoc[]>()
    expect(variants.map((v) => v.sku)).toEqual(["WINESILK-WINE", "WINESILK-IVORY"])
    expect(variants.map((v) => v.stock.onHand)).toEqual([10_000, 5_500])
    expect(variants.map((v) => v.options.colorName)).toEqual(["Wine", "Ivory"])
    const p = (await Product.findById(made.id).lean())!
    expect(p).toMatchObject({ variantCount: 2, inStock: true })
    expect(p.priceRange).toMatchObject({ minPaise: 45000, maxPaise: 45000 })
  })

  it("makes codes unique when a product with the same name exists", async () => {
    const categoryId = await category()
    await createProductWithVariants(owner, product({ slug: "twin" }, categoryId), [draft()])
    const second = await createProductWithVariants(
      owner,
      product({ slug: "twin-2", name: "Twin" }, categoryId),
      [draft({ sku: "" })]
    )
    const skus = (await ProductVariant.find({ productId: second.id }).lean()).map((v) => v.sku)
    expect(skus).toHaveLength(1)
    expect(new Set((await ProductVariant.find({}).lean()).map((v) => v.sku)).size).toBe(
      await ProductVariant.countDocuments()
    )
  })

  it("creates nothing when any colour is wrong, and names the colour and the box", async () => {
    const categoryId = await category()
    const before = await Product.countDocuments()
    await expect(
      createProductWithVariants(owner, product({}, categoryId), [
        draft(),
        draft({ colorName: "Bad", price: "0" }),
      ])
    ).rejects.toMatchObject({ details: [{ path: "variants.1.price" }] })
    await expect(
      createProductWithVariants(owner, product({}, categoryId), [draft({ initialStock: "1.2345" })])
    ).rejects.toMatchObject({ details: [{ path: "variants.0.initialStock" }] })
    await expect(
      createProductWithVariants(owner, product({}, categoryId), [draft({ salePrice: "500" })])
    ).rejects.toMatchObject({ details: [{ path: "variants.0.salePrice" }] })
    await expect(
      createProductWithVariants(owner, product({}, categoryId), [
        draft(),
        draft({ kind: "piece", minQty: "1", stepQty: "1", colorName: "Red" }),
      ])
    ).rejects.toMatchObject({ details: [{ path: "variants.1.kind" }] })
    await expect(
      createProductWithVariants(owner, product({}, categoryId), [draft(), draft()])
    ).rejects.toMatchObject({ details: [{ path: "variants.1.colorName" }] })
    expect(await Product.countDocuments()).toBe(before)
  })

  it("removes the product again if saving a later colour fails", async () => {
    const categoryId = await category()
    await ProductVariant.create({
      productId: oid(),
      sku: "TAKEN-SKU",
      sellingUnit: {
        kind: "length",
        baseUnit: "mm",
        displayUnit: "m",
        baseUnitsPerDisplayUnit: 1000,
        pricePerBaseUnits: 1000,
        minQty: 500,
        stepQty: 500,
      },
      pricePaise: 100,
    })
    const before = [await Product.countDocuments(), await ProductVariant.countDocuments()]
    await expect(
      createProductWithVariants(owner, product({ slug: "half-made" }, categoryId), [
        draft({ sku: "OK-ONE" }),
        draft({ colorName: "Red", sku: "TAKEN-SKU" }),
      ])
    ).rejects.toMatchObject({ details: [{ path: "variants.1.sku" }] })
    expect([await Product.countDocuments(), await ProductVariant.countDocuments()]).toEqual(before)
    expect(await Product.exists({ slug: "half-made" })).toBeNull()
  })

  it("needs permission and a sensible number of colours", async () => {
    const categoryId = await category()
    await expect(
      createProductWithVariants(support, product({}, categoryId), [draft()])
    ).rejects.toBeInstanceOf(ForbiddenError)
    await expect(
      createProductWithVariants(
        owner,
        product({}, categoryId),
        Array.from({ length: 21 }, (_, i) => draft({ colorName: `C${i}` }))
      )
    ).rejects.toBeInstanceOf(ValidationError)
    expect(() =>
      dryRunVariant(
        variantInputSchema.parse({ sku: "AB", status: "active", kind: "length", price: "" })
      )
    ).toThrow()
  })
})

describe("invoices", () => {
  async function paid(email = "buyer@example.com", when = NOW) {
    const userId = oid()
    const address = await Address.create({
      userId,
      fullName: "Meera Shah",
      phone: "9876543210",
      line1: "12 Ring Road",
      city: "Surat",
      state: "Gujarat",
      pincode: "395007",
    })
    const p = (await Product.findOne({ slug: "handloom-cotton" }).lean())!
    const v = (await ProductVariant.findOne({ productId: p._id })
      .sort({ sku: 1 })
      .lean<ProductVariantDoc>())!
    await addToCart(userId, String(v._id), 2500)
    const s = await createCheckout({
      userId,
      email,
      addressId: String(address._id),
      idempotencyKey: idem(),
      now: when,
    })
    await markPaymentCaptured({
      gatewayOrderId: s.gatewayOrderId,
      paymentId: `pay_${idem()}`,
      amountPaise: s.amountPaise,
      now: when,
    })
    const order = (await Order.findOne({ orderNumber: s.orderNumber }).lean<OrderDoc>())!
    return { userId, order }
  }

  it("numbers an order when it is paid, in the financial year's own sequence", async () => {
    const a = await paid()
    const b = await paid()
    expect(a.order.invoice?.number).toMatch(/^INV\/2026-27\/000001$/)
    expect(b.order.invoice?.number).toMatch(/^INV\/2026-27\/000002$/)
    expect(await ensureInvoice(String(a.order._id))).toMatchObject({ number: "INV/2026-27/000001" }) // asking again never renumbers
  })

  it("gives many orders paid at the same moment numbers with no gaps and no repeats", async () => {
    const orders = await Promise.all(Array.from({ length: 12 }, () => paid()))
    const numbers = (
      await Order.find({ _id: mongoose.trusted({ $in: orders.map((o) => o.order._id) }) }).lean<
        OrderDoc[]
      >()
    )
      .map((o) => o.invoice!.number)
      .sort()
    expect(numbers).toEqual(
      Array.from({ length: 12 }, (_, i) => `INV/2026-27/${String(i + 1).padStart(6, "0")}`)
    )
  })

  it("starts a new sequence in April", async () => {
    await paid("a@example.com", new Date("2027-03-31T10:00:00Z"))
    const april = await paid("b@example.com", new Date("2027-03-31T19:00:00Z")) // 00:30 on 1 April in India
    expect(april.order.invoice?.number).toBe("INV/2027-28/000001")
  })

  it("is made on first view for an order paid before invoices existed, and is not made for an unpaid one", async () => {
    const { userId, order } = await paid()
    await Order.updateOne({ _id: order._id }, { $unset: { invoice: 1 } })
    const inv = await getInvoiceForUser(userId, order.orderNumber)
    expect(inv.number).toMatch(/^INV\/2026-27\/\d{6}$/)

    const unpaidUser = oid()
    const address = await Address.create({
      userId: unpaidUser,
      fullName: "A B",
      phone: "9876543210",
      line1: "1 Road",
      city: "Surat",
      state: "Gujarat",
      pincode: "395003",
    })
    const p = (await Product.findOne({ slug: "handloom-cotton" }).lean())!
    const v = (await ProductVariant.findOne({ productId: p._id }).lean<ProductVariantDoc>())!
    await addToCart(unpaidUser, String(v._id), 1000)
    const s = await createCheckout({
      userId: unpaidUser,
      email: "u@example.com",
      addressId: String(address._id),
      idempotencyKey: idem(),
      now: NOW,
    })
    await expect(getInvoiceForUser(unpaidUser, s.orderNumber)).rejects.toBeInstanceOf(
      ValidationError
    )
  })

  it("is a Bill of Supply with no GST while the shop is not registered, and a Tax Invoice once it is", async () => {
    await SiteSettings.updateOne(
      { key: "default" },
      {
        $set: {
          "store.legalName": "Ambar Textiles",
          "store.addressLines": ["12 Mill Road", "Vadodara 390007"],
          "store.phone": "+91 98765 43210",
        },
      },
      { upsert: true }
    )
    const { userId, order } = await paid()
    const bill = await getInvoiceForUser(userId, order.orderNumber)
    expect(bill).toMatchObject({
      title: "Bill of Supply",
      seller: { name: "Ambar Textiles", addressLines: ["12 Mill Road", "Vadodara 390007"] },
      totalPaise: order.pricing.totalPaise,
    })
    expect(bill.seller.gstin).toBeUndefined()
    expect(bill.note).toMatch(/not registered under GST/)

    await SiteSettings.updateOne(
      { key: "default" },
      { $set: { "store.gstin": "24ABCDE1234F1Z5", "tax.enabled": true } }
    )
    const taxed = await getInvoiceForUser(userId, order.orderNumber)
    expect(taxed).toMatchObject({ title: "Tax Invoice", seller: { gstin: "24ABCDE1234F1Z5" } })
    expect(taxed.number).toBe(bill.number) // the same number either way
  })

  it("holds what the customer needs and nothing private: no cost, no profit, other people's data", async () => {
    const { userId, order } = await paid()
    const inv = await getInvoiceForUser(userId, order.orderNumber)
    expect(inv.buyer).toMatchObject({
      name: "Meera Shah",
      phone: "9876543210",
      email: "buyer@example.com",
    })
    expect(inv.lines[0]).toMatchObject({
      description: "Handloom cotton",
      quantity: "2.5 m",
      amountPaise: 45000,
      unitLabel: "per metre",
    })
    expect(JSON.stringify(inv)).not.toMatch(/costPaise|costLine|purchase/i)
    expect(inv.payment).toMatch(/^Paid online/)
  })

  it("belongs to the buyer and to staff who may read orders, and to nobody else", async () => {
    const { userId, order } = await paid()
    await expect(getInvoiceForUser(oid(), order.orderNumber)).rejects.toBeInstanceOf(NotFoundError)
    await expect(getInvoiceForUser(userId, "AM-0000-000000")).rejects.toBeInstanceOf(NotFoundError)
    await expect(
      getInvoiceForStaff({ id: oid(), role: "customer" }, order.orderNumber)
    ).rejects.toBeInstanceOf(ForbiddenError)
    await expect(
      getInvoiceForStaff({ id: oid(), role: "catalog_manager" }, order.orderNumber)
    ).rejects.toBeInstanceOf(ForbiddenError)
    await expect(getInvoiceForStaff(support, order.orderNumber)).resolves.toMatchObject({
      orderNumber: order.orderNumber,
    })
  })
})
