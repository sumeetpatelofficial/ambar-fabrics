import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { MongoMemoryReplSet } from "mongodb-memory-server"
import mongoose from "mongoose"
import { PAGE_DEFAULTS, PAGE_SLUGS } from "@/config/pages"
import { ForbiddenError } from "@/lib/errors"
import { Address } from "@/models/address"
import { Category } from "@/models/category"
import { Job } from "@/models/job"
import { Product } from "@/models/product"
import { ProductVariant, type ProductVariantDoc } from "@/models/product-variant"
import { Redirect } from "@/models/redirect"
import { SiteSettings } from "@/models/site-settings"
import { addToCart } from "@/services/cart-service"
import { contactSchema, sendContactMessage } from "@/services/contact-service"
import { getPage, listPagesAdmin, resetPage, savePage } from "@/services/content-service"
import { createCheckout, markPaymentCaptured } from "@/services/order-service"
import {
  deleteRedirect,
  getSitemapEntries,
  listRedirects,
  saveRedirect,
} from "@/services/seo-service"
import { trackOrder } from "@/services/tracking-service"
import { seedSampleCatalog } from "../../scripts/lib/seed-catalog"
import { resetDatabase, startDatabase, stopDatabase } from "./helpers"

vi.mock("server-only", () => ({}))

let replSet: MongoMemoryReplSet
const NOW = new Date("2026-10-14T06:00:00Z")
const oid = () => String(new mongoose.Types.ObjectId())
const editor = { id: oid(), role: "admin" as const }

beforeAll(async () => {
  replSet = await startDatabase("content_seo_test")
}, 240_000)
afterAll(() => stopDatabase(replSet))
beforeEach(async () => {
  await resetDatabase()
  await seedSampleCatalog(NOW)
})

describe("information pages", () => {
  it("every page has a draft, so a new shop is complete", async () => {
    for (const slug of PAGE_SLUGS) {
      const page = await getPage(slug)
      expect(page).toMatchObject({ slug, edited: false, title: PAGE_DEFAULTS[slug].title })
      expect(page.body.length).toBeGreaterThan(40)
    }
  })

  it("states the shop's own rules in the returns draft", async () => {
    const body = (await getPage("return-refund-policy")).body
    expect(body).toMatch(/cannot be returned/i)
    expect(body).toMatch(/7 days/)
  })

  it("an edit replaces the draft, and resetting brings it back", async () => {
    await savePage(editor, "about", {
      title: "About Ambar",
      description: "Who we are",
      body: "We are a small shop in Vadodara selling cloth.",
    })
    expect(await getPage("about")).toMatchObject({
      edited: true,
      title: "About Ambar",
      body: "We are a small shop in Vadodara selling cloth.",
    })
    expect((await listPagesAdmin(editor)).find((p) => p.slug === "about")).toMatchObject({
      edited: true,
    })
    await resetPage(editor, "about")
    expect(await getPage("about")).toMatchObject({ edited: false, title: "About us" })
  })

  it("refuses HTML, empty text, unknown pages and people without the permission", async () => {
    await expect(
      savePage(editor, "faq", { title: "FAQ", body: "<script>alert(1)</script> hello there" })
    ).rejects.toMatchObject({ details: [{ path: "body" }] })
    await expect(savePage(editor, "faq", { title: "FAQ", body: "short" })).rejects.toMatchObject({
      details: [{ path: "body" }],
    })
    await expect(
      savePage(editor, "../etc/passwd", { title: "x y", body: "some text here ok" })
    ).rejects.toThrow()
    await expect(
      savePage({ id: oid(), role: "support" }, "faq", {
        title: "FAQ",
        body: "Some real text here.",
      })
    ).rejects.toBeInstanceOf(ForbiddenError)
  })
})

describe("sitemap", () => {
  it("lists the public pages and leaves out drafts, empty products and hidden categories", async () => {
    const hidden = await Category.create({ name: "Secret", slug: "secret", status: "hidden" })
    await Product.create({
      name: "Draft thing",
      slug: "draft-thing",
      status: "draft",
      categoryIds: [hidden._id],
    })
    const paths = (await getSitemapEntries(NOW)).map((e) => e.path)
    expect(paths).toContain("/")
    expect(paths).toContain("/products/handloom-cotton")
    expect(paths).toContain("/categories/fabrics")
    expect(paths).toContain("/shipping-policy")
    expect(paths).toContain("/collections/navratri-edit")
    expect(paths).not.toContain("/products/draft-thing")
    expect(paths).not.toContain("/categories/secret")
    expect(paths.every((p) => p.startsWith("/"))).toBe(true)
    expect(new Set(paths).size).toBe(paths.length) // no duplicates
    expect(
      paths.filter((p) =>
        ["/cart", "/checkout", "/admin", "/account", "/login"].some((x) => p.startsWith(x))
      )
    ).toEqual([])
  })

  it("drops a product that was unpublished and a collection whose season is over", async () => {
    await Product.updateOne({ slug: "handloom-cotton" }, { $set: { status: "archived" } })
    await mongoose
      .model("Collection")
      .updateOne({ slug: "navratri-edit" }, { $set: { endsAt: new Date("2026-01-01") } })
    const paths = (await getSitemapEntries(NOW)).map((e) => e.path)
    expect(paths).not.toContain("/products/handloom-cotton")
    expect(paths).not.toContain("/collections/navratri-edit")
  })
})

describe("redirects", () => {
  it("saves, updates and deletes a redirect for a shop address", async () => {
    await saveRedirect(editor, {
      fromPath: "/products/old-silk",
      toPath: "/products/new-silk",
      permanent: true,
    })
    await saveRedirect(editor, {
      fromPath: "/products/old-silk",
      toPath: "/products/newer-silk",
      permanent: false,
    })
    const all = await listRedirects(editor)
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ toPath: "/products/newer-silk", statusCode: 302 })
    await deleteRedirect(editor, String(all[0]!._id))
    expect(await Redirect.countDocuments()).toBe(0)
  })

  it("refuses odd addresses, outside destinations, loops and chains", async () => {
    const save = (fromPath: string, toPath: string) =>
      saveRedirect(editor, { fromPath, toPath, permanent: true })
    await expect(save("/admin", "/")).rejects.toMatchObject({ details: [{ path: "fromPath" }] })
    await expect(save("/products/a b", "/")).rejects.toMatchObject({
      details: [{ path: "fromPath" }],
    })
    await expect(save("/products/a", "https://evil.example")).rejects.toMatchObject({
      details: [{ path: "toPath" }],
    })
    await expect(save("/products/a", "//evil.example")).rejects.toMatchObject({
      details: [{ path: "toPath" }],
    })
    await expect(save("/products/a", "/products/a")).rejects.toMatchObject({
      details: [{ path: "toPath" }],
    })
    await save("/products/b", "/products/c")
    await expect(save("/products/a", "/products/b")).rejects.toMatchObject({
      details: [{ path: "toPath" }],
    })
    await expect(
      saveRedirect(
        { id: oid(), role: "support" },
        { fromPath: "/products/z", toPath: "/", permanent: true }
      )
    ).rejects.toBeInstanceOf(ForbiddenError)
  })
})

describe("tracking an order without signing in", () => {
  async function paid() {
    const userId = oid()
    const address = await Address.create({
      userId,
      fullName: "Private Person",
      phone: "9876543210",
      line1: "99 Secret Lane",
      city: "Surat",
      state: "Gujarat",
      pincode: "395003",
    })
    const product = (await Product.findOne({ slug: "handloom-cotton" }).lean())!
    const variant = (await ProductVariant.findOne({ productId: product._id })
      .sort({ sku: 1 })
      .lean<ProductVariantDoc>())!
    await addToCart(userId, String(variant._id), 1000)
    const session = await createCheckout({
      userId,
      email: "Buyer@Example.com",
      addressId: String(address._id),
      idempotencyKey: "track-key-0000000001-abcdefgh",
      now: NOW,
    })
    return session
  }

  it("shows progress to someone with the number and the email, and nothing personal", async () => {
    const s = await paid()
    expect(await trackOrder(s.orderNumber, "buyer@example.com")).toBeNull() // unpaid orders are not shown
    await markPaymentCaptured({
      gatewayOrderId: s.gatewayOrderId,
      paymentId: "pay_t1",
      amountPaise: s.amountPaise,
    })
    const found = await trackOrder(` ${s.orderNumber.toLowerCase()} `, " BUYER@example.com ")
    expect(found).toMatchObject({
      orderNumber: s.orderNumber,
      status: "confirmed",
      items: [{ name: expect.any(String), quantity: "1 m" }],
    })
    const text = JSON.stringify(found)
    for (const secret of ["Private Person", "99 Secret Lane", "9876543210", "395003"])
      expect(text).not.toContain(secret)
  })

  it("answers the same for a wrong email and a wrong number", async () => {
    const s = await paid()
    await markPaymentCaptured({
      gatewayOrderId: s.gatewayOrderId,
      paymentId: "pay_t2",
      amountPaise: s.amountPaise,
    })
    expect(await trackOrder(s.orderNumber, "someone@else.example")).toBeNull()
    expect(await trackOrder("AM-0000-000000", "buyer@example.com")).toBeNull()
    expect(await trackOrder("x", "$ne")).toBeNull()
  })
})

describe("the contact form", () => {
  const msg = {
    name: "Asha",
    email: "asha@example.com",
    message: "Do you have this fabric in blue?",
  }

  it("needs the shop's email to be set, then queues one message with a reply-to", async () => {
    await expect(sendContactMessage(contactSchema.parse(msg))).rejects.toThrow(/cannot be sent/i)
    await SiteSettings.updateOne(
      { key: "default" },
      { $set: { "store.email": "shop@example.com" } },
      { upsert: true }
    )
    await sendContactMessage(contactSchema.parse(msg))
    await sendContactMessage(contactSchema.parse(msg)) // a double click
    const jobs = await Job.find({ "payload.template": "contact_message" }).lean()
    expect(jobs).toHaveLength(1)
    expect(jobs[0]!.payload).toMatchObject({ to: "shop@example.com", replyTo: "asha@example.com" })
  })

  it("rejects bad input, link spam and header tricks", () => {
    expect(() => contactSchema.parse({ ...msg, email: "nope" })).toThrow()
    expect(() => contactSchema.parse({ ...msg, message: "short" })).toThrow()
    expect(() =>
      contactSchema.parse({
        ...msg,
        message: "see http://a.example http://b.example http://c.example",
      })
    ).toThrow()
    expect(() =>
      contactSchema.parse({ ...msg, email: "a@example.com\nBcc: x@example.com" })
    ).toThrow()
  })

  it("escapes what a visitor typed in the email", async () => {
    await SiteSettings.updateOne(
      { key: "default" },
      { $set: { "store.email": "shop@example.com" } },
      { upsert: true }
    )
    await sendContactMessage(
      contactSchema.parse({
        ...msg,
        name: "<b>Eve</b>",
        message: "<script>alert(1)</script> hello shop",
      })
    )
    const job = (await Job.findOne({ "payload.template": "contact_message" }).lean())!
    expect(String((job.payload as { html: string }).html)).not.toContain("<script>")
    expect(String((job.payload as { subject: string }).subject)).not.toMatch(/[\r\n]/)
  })
})
