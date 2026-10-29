import type { Page } from "@playwright/test"
import { ADMIN_SECTIONS } from "../../src/config/admin-nav"
import { E2E_ADMIN, E2E_LOOKS, E2E_NAV, E2E_SUPPORT } from "./accounts"
import { choose, expect, expectNoViolations, label, otherDevice, test, text } from "./helpers"

async function signInAs(page: Page, who: { email: string; password: string }) {
  await page.goto("/login")
  await label(page, "Email address").fill(who.email)
  await label(page, "Password", { exact: true }).fill(who.password)
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await expect(page).toHaveURL((url) => !url.pathname.startsWith("/login"))
}

const notFound = (page: Page) =>
  page.getByRole("heading", { name: /We could not find that page|That admin page does not exist/ })

test.describe("who can open which admin page", () => {
  test("the owner opens every section; support only what their role allows; others see nothing", async ({
    page,
    browser,
  }) => {
    await signInAs(page, E2E_ADMIN)
    for (const s of ADMIN_SECTIONS) {
      await page.goto(s.href)
      await expect(page.getByRole("heading", { level: 1 }).first(), s.href).toBeVisible()
      await expect(notFound(page), s.href).toHaveCount(0)
    }

    const context = await otherDevice(browser)
    const support = await context.newPage()
    await signInAs(support, E2E_SUPPORT)
    const allowed = new Set([
      "/admin",
      "/admin/orders",
      "/admin/products",
      "/admin/categories",
      "/admin/fabrics",
      "/admin/prints",
      "/admin/collections",
      "/admin/inventory",
      "/admin/customers",
      "/admin/reviews",
    ])
    for (const s of ADMIN_SECTIONS) {
      await support.goto(s.href)
      if (allowed.has(s.href)) await expect(notFound(support), s.href).toHaveCount(0)
      else await expect(notFound(support), s.href).toBeVisible()
    }
    // Support may look at products but not create them: the services refuse even if the page is reached.
    await support.goto("/admin/products/new")
    await expect(notFound(support)).toBeVisible()
    const csv = await support.request.get("/admin/inventory/export")
    expect(csv.status()).toBe(200) // support has inventory:read
    await context.close()
  })

  test("a signed-out visitor is sent to sign in, and a customer gets no hint the area exists", async ({
    page,
    request,
  }) => {
    const sheet = await request.get("/admin/inventory/export", { maxRedirects: 0 })
    expect([307, 308, 404]).toContain(sheet.status()) // sent to sign in, never the spreadsheet
    expect(sheet.headers()["content-type"] ?? "").not.toContain("text/csv")
    await page.goto("/admin/settings")
    await expect(page).toHaveURL(/\/login\?next=/)
  })
})

test.describe("running the shop from the admin", () => {
  test("add a category, a product and a variant, see it in the shop, change its price and stock, and find it in the audit log", async ({
    page,
  }) => {
    const stamp = Date.now().toString(36)
    const name = `Test silk ${stamp}`
    const slug = `test-silk-${stamp}`
    await signInAs(page, E2E_ADMIN)

    await page.goto("/admin/categories/new")
    await label(page, "Name").fill(`Test category ${stamp}`)
    await page.getByRole("button", { name: "Save category" }).click()
    await expect(page).toHaveURL(/\/admin\/categories\?saved=1/)

    await page.goto("/admin/products/new")
    await expectNoViolations(page, "/admin/products/new")
    await label(page, "Name", { exact: true }).first().fill(name)
    await label(page, "Web address").fill(slug)
    await choose(page, label(page, "Category"), `Test category ${stamp}`)
    await choose(page, label(page, "Status", { exact: true }), "Active")

    // Colours, prices, what was paid and the stock are part of the same form.
    const blocks = page.getByRole("group", { name: /^(Variant \d|Colour:)/ })
    const first = blocks.first()
    await first.getByRole("button", { name: "Use Red" }).click()
    await first.getByLabel("Colour name").fill("Wine")
    await first.getByLabel(/^Selling price/).fill("450")
    await first.getByLabel(/^Purchase price/).fill("300")
    await first.getByLabel(/^Quantity in stock/).fill("10")
    await expect(first.getByRole("status")).toContainText("Profit ₹150 per metre, a 33.3% margin.")
    await expect(first.getByRole("status")).toContainText(
      "cost ₹3,000, sells for ₹4,500, profit ₹1,500"
    )
    await first.getByLabel(/^Purchase price/).fill("500")
    await expect(first.getByRole("status")).toContainText("You would lose ₹50 on every metre.")
    await first.getByLabel(/^Purchase price/).fill("300")
    await first.getByText("More options for this colour").click()
    await first.getByLabel("Product code (SKU)").fill(`SILK-${stamp}`)

    await page.getByRole("button", { name: "Add another colour" }).click()
    const second = blocks.nth(1)
    await second.getByLabel("Colour name").fill("Ivory")
    await second.getByLabel(/^Selling price/).fill("500")
    await second.getByLabel(/^Quantity in stock/).fill("4.5")

    // A mistake in one colour stops the whole product and says which box.
    await first.getByLabel(/^Quantity in stock/).fill("1.2345")
    await page.getByRole("button", { name: "Create product" }).click()
    await expect(
      page.getByRole("alert").filter({ hasText: "at most 3 decimal places" })
    ).toBeVisible()
    await first.getByLabel(/^Quantity in stock/).fill("10")
    await page.getByRole("button", { name: "Create product" }).click()
    await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f]{24}\?created=1/)
    await expect(page.getByText(`SILK-${stamp}`, { exact: false }).first()).toBeVisible()
    await expect(page.getByText("10 m on hand", { exact: false })).toBeVisible()
    await expect(page.getByText("4.5 m on hand", { exact: false })).toBeVisible()
    await page.getByText(`SILK-${stamp}`).first().click()
    await expect(page.getByLabel("Purchase price").first()).toHaveValue("300.00") // the owner sees what was paid

    await expect(page.getByText(`SILK-${stamp}`.toUpperCase()).first()).toBeVisible()
    // A page that was a 404 a moment ago (the admin's own link prefetch) is looked up again within seconds.
    await expect(async () => {
      await page.goto(`/products/${slug}`)
      await expect(page.getByRole("heading", { level: 1, name })).toBeVisible({ timeout: 1500 })
    }).toPass({ timeout: 20_000 })
    await expect(text(page, "₹450", { exact: false }).first()).toBeVisible()

    // Change the price: the shop shows it straight away.
    await page.goto("/admin/products?q=" + slug)
    await page.getByRole("link", { name }).click()
    await page.getByText(`SILK-${stamp}`).first().click()
    const edit = page.getByRole("form", { name: `Edit SILK-${stamp}` })
    await edit.getByLabel("Selling price", { exact: true }).fill("500")
    await edit.getByRole("button", { name: "Save variant" }).click()
    await expect(text(page, "Variant saved.")).toBeVisible()
    await page.goto(`/products/${slug}`)
    await expect(text(page, "₹500", { exact: false }).first()).toBeVisible()

    // Stock: add 5 metres on the inventory page.
    await page.goto(`/admin/inventory?q=${stamp}`)
    await expect(text(page, "10 m available", { exact: false })).toBeVisible()
    await page.getByText(`Change stock for SILK-${stamp}`).click()
    const stock = page.getByRole("form", { name: "Change stock" })
    await stock.getByLabel("Amount (metres)").fill("5")
    await stock.getByLabel("Reason").fill("New roll")
    await stock.getByRole("button", { name: "Update stock" }).click()
    await expect(text(page, "15 m available", { exact: false })).toBeVisible()
    await stock.getByLabel("Amount (metres)").fill("1.2345")
    await stock.getByLabel("Reason").fill("Typo")
    await stock.getByRole("button", { name: "Update stock" }).click()
    await expect(
      page.getByRole("alert").filter({ hasText: "at most 3 decimal places" })
    ).toBeVisible()

    await page.goto("/admin/audit?action=product.")
    await expect(text(page, "product.created", { exact: false }).first()).toBeVisible()
  })

  test("coupons and settings are saved, and a bad value is explained", async ({ page }) => {
    const code = `T${Date.now().toString(36).toUpperCase()}`
    await signInAs(page, E2E_ADMIN)
    await page.goto("/admin/coupons/new")
    await label(page, "Code").fill(code)
    await label(page, "Percentage").fill("150")
    await page.getByRole("button", { name: "Save coupon" }).click()
    await expect(page.getByRole("alert").filter({ hasText: "0.01 to 100" })).toBeVisible()
    await label(page, "Percentage").fill("12.5")
    await page.getByRole("button", { name: "Save coupon" }).click()
    await expect(page).toHaveURL(/\/admin\/coupons\?saved=1/)
    await expect(page.getByRole("link", { name: code })).toBeVisible()

    await page.goto("/admin/settings")
    await label(page, "Hold stock while paying (minutes)").fill("2")
    await page.getByRole("button", { name: "Save settings" }).click()
    await expect(page.getByRole("alert").filter({ hasText: "At least 5 minutes" })).toBeVisible()
    await label(page, "Hold stock while paying (minutes)").fill("20")
    await page.getByRole("button", { name: "Save settings" }).click()
    await expect(text(page, "Settings saved.")).toBeVisible()
  })

  test("the stock sheet downloads for staff", async ({ page }) => {
    await signInAs(page, E2E_ADMIN)
    const response = await page.request.get("/admin/inventory/export")
    expect(response.status()).toBe(200)
    expect(response.headers()["content-type"]).toContain("text/csv")
    expect((await response.text()).split("\n")[0]).toBe(
      "SKU,Product,Option,On hand,Held for orders,Available,Status"
    )
  })
})

test.describe("the admin looks and works like its own app", () => {
  test("no shop header, footer or announcement bar; its own sidebar, top bar and overview", async ({
    page,
  }) => {
    await signInAs(page, E2E_LOOKS)
    await page.goto("/admin")
    await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible()
    await expect(page.getByRole("contentinfo")).toHaveCount(0) // the shop's footer
    await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0) // the shop's menu
    await expect(page.getByText("Free shipping on orders above")).toHaveCount(0) // the announcement bar

    const menu = page.getByRole("navigation", { name: "Admin" })
    await expect(menu.getByRole("link", { name: "Orders" })).toBeVisible()
    await expect(menu.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "aria-current",
      "page"
    )
    await expect(page.getByRole("link", { name: "View shop" })).toBeVisible()
    await expect(page.getByRole("navigation", { name: "Time period" })).toBeVisible()
    await expect(page.getByRole("img", { name: /^Sales by day/ })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Recent orders" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Inventory alerts" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Top products" })).toBeVisible()
    await expectNoViolations(page, "/admin")

    await page.getByRole("link", { name: "Last 7 days" }).click()
    await expect(page).toHaveURL(/range=7d/)
    await expect(page.getByRole("link", { name: "Last 7 days" })).toHaveAttribute(
      "aria-current",
      "true"
    )
  })

  test("on a phone the menu opens from a button, and nothing scrolls sideways", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 800 })
    await signInAs(page, E2E_LOOKS)
    await page.goto("/admin/products")
    await expect(page.getByRole("navigation", { name: "Admin" })).toHaveCount(0) // hidden until opened
    await page.getByRole("button", { name: "Open the admin menu" }).click()
    await page
      .getByRole("navigation", { name: "Admin" })
      .getByRole("link", { name: "Orders" })
      .click()
    await expect(page).toHaveURL(/\/admin\/orders/)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test("signing out from the admin returns to the shop's front page", async ({ page }) => {
    await signInAs(page, E2E_LOOKS)
    await page.goto("/admin")
    await page.getByRole("button", { name: "Sign out" }).click()
    await expect(page).toHaveURL("/")
    await page.goto("/admin")
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe("finding your way around the admin", () => {
  test("a sub-category shows where it sits, and Back goes up one level", async ({ page }) => {
    await signInAs(page, E2E_NAV)
    await page.goto("/admin/categories")
    await page.locator("#main").getByRole("link", { name: "Cotton", exact: true }).first().click()
    await expect(page.getByRole("heading", { level: 1, name: "Cotton" })).toBeVisible()
    const trail = page.getByRole("navigation", { name: "Breadcrumb" })
    await expect(trail.getByRole("link", { name: "Categories" })).toBeVisible()
    await expect(trail.getByRole("link", { name: "Fabrics" })).toBeVisible()
    await expect(trail.getByText("Cotton")).toHaveAttribute("aria-current", "page")
    await page.getByRole("link", { name: "Back to Fabrics" }).click()
    await expect(page.getByRole("heading", { level: 1, name: "Fabrics" })).toBeVisible()
    await page.getByRole("link", { name: "Back to Categories" }).click()
    await expect(page.getByRole("heading", { level: 1, name: "Categories" })).toBeVisible()
  })

  test("products are cards in a grid, with numbered pages that keep the search", async ({
    page,
  }) => {
    await signInAs(page, E2E_NAV)
    await page.goto("/admin/products")
    const cards = page
      .locator("#main ul > li")
      .filter({ has: page.getByRole("heading", { level: 2 }) })
    await expect(cards).toHaveCount(20)
    await expect(page.getByText("Showing 1 to 20 of", { exact: false })).toBeVisible()
    await expectNoViolations(page, "/admin/products")
    await page.getByRole("link", { name: "Page 2" }).click()
    await expect(page).toHaveURL(/\/admin\/products\?page=2$/)
    await expect(page.getByRole("link", { name: "Page 2" })).toHaveAttribute("aria-current", "page")
    await expect(page.getByRole("link", { name: "Previous page" })).toBeVisible()
    await page.goto("/admin/products?q=cotton&status=active")
    await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible()
    await page.locator("#main").getByRole("heading", { level: 2 }).first().getByRole("link").click()
    await expect(
      page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Products" })
    ).toBeVisible()
    await page.getByRole("link", { name: "Back to Products" }).click()
    await expect(page).toHaveURL(/\/admin\/products$/)
  })

  test("long lists page: orders, customers, inventory", async ({ page }) => {
    await signInAs(page, E2E_NAV)
    await page.goto("/admin/inventory")
    await expect(page.getByRole("navigation", { name: "Pagination" })).toBeVisible()
    await page.getByRole("link", { name: "Next page" }).click()
    await expect(page).toHaveURL(/\/admin\/inventory\?page=2$/)
    await page.goto("/admin/customers")
    await expect(page.getByRole("heading", { level: 1, name: "Customers" })).toBeVisible()
    await page.goto("/admin/orders")
    await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible()
  })
})

test.describe("purchase prices stay private", () => {
  test("an owner sees what was paid; support, who can open the product, does not", async ({
    page,
    browser,
  }) => {
    await signInAs(page, E2E_NAV)
    await page.goto("/admin/products?q=handloom")
    await page.locator("#main").getByRole("heading", { level: 2 }).first().getByRole("link").click()
    await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f]{24}$/)
    const url = page.url()
    await expect(page.getByLabel("Purchase price").first()).toBeAttached()

    const context = await otherDevice(browser)
    const support = await context.newPage()
    await signInAs(support, E2E_SUPPORT)
    await support.goto(url)
    await expect(support.getByRole("heading", { level: 1 })).toBeVisible()
    await expect(support.getByLabel("Purchase price")).toHaveCount(0)
    await expect(support.getByText("Profit", { exact: false })).toHaveCount(0)
    await support.goto("/admin")
    await expect(support.getByText("Estimated profit")).toHaveCount(0)
    await context.close()
  })
})
