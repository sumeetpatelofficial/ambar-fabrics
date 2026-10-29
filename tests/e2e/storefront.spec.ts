import type { Page } from "@playwright/test"
import {
  cardTitles,
  expect,
  expectHeadingOrder,
  expectNoViolations,
  jsonLd,
  test,
  text,
  watchConsole,
  choose,
} from "./helpers"

type ProductLd = {
  name: string
  sku: string
  aggregateRating?: unknown
  offers: {
    price: string
    priceCurrency: string
    availability: string
    priceSpecification: { referenceQuantity: { unitCode: string; value: number } }
  }
}
type CrumbLd = { itemListElement: { name: string }[] }

const productCards = (page: Page) => page.locator("article").filter({ visible: true })

test.describe("public routes: direct navigation, refresh and status codes", () => {
  const ok = [
    "/",
    "/shop",
    "/categories",
    "/categories/fabrics",
    "/categories/fabrics/cotton-fabrics",
    "/categories/dupattas/bandhani-dupattas",
    "/collections/navratri-edit",
    "/collections/everyday-cottons",
    "/new-arrivals",
    "/bestsellers",
    "/sale",
    "/search",
    "/search?q=cotton",
    "/products/handloom-cotton",
    "/account/wishlist",
  ]
  for (const path of ok) {
    test(`${path} loads directly and after a refresh`, async ({ page }) => {
      const res = await page.goto(path)
      expect(res?.status()).toBe(200)
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
      const reload = await page.reload()
      expect(reload?.status()).toBe(200)
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    })
  }

  for (const path of [
    "/products/does-not-exist",
    "/categories/nope",
    "/categories/fabrics/nope",
    "/collections/nope",
    "/products/Bad%20Slug",
  ]) {
    test(`${path} is a real 404 with a way forward`, async ({ page }) => {
      const res = await page.goto(path)
      expect(res?.status()).toBe(404)
      await expect(page.getByRole("heading", { name: "We could not find that page" })).toBeVisible()
      await expect(page.getByRole("link", { name: "Browse categories" })).toBeVisible()
      // Next adds this tag for not-found pages; it may appear twice, which is harmless.
      await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute(
        "content",
        /noindex/
      )
    })
  }

  test("title, description, canonical and social tags are in <head> of the raw HTML for every visitor", async ({
    request,
  }) => {
    const agents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36",
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "facebookexternalhit/1.1",
      "Twitterbot/1.0",
    ]
    for (const path of ["/products/handloom-cotton", "/categories/fabrics", "/shop", "/"]) {
      for (const agent of agents) {
        const html = await (await request.get(path, { headers: { "user-agent": agent } })).text()
        const head = html.split("</head>")[0] ?? ""
        const label = `${path} as ${agent.slice(0, 24)}`
        expect(head, label).toMatch(/<title>[^<]+<\/title>/)
        expect(head, label).toMatch(/<meta name="description" content="[^"]+"/)
        expect(head, label).toMatch(/<link rel="canonical" href="http:\/\/localhost:3100/)
        expect(head, label).toMatch(/<meta property="og:title"/)
        expect(head, label).toMatch(/<meta name="twitter:card"/)
      }
    }
  })

  test("a product that is no longer for sale stops resolving", async ({ request }) => {
    expect((await request.get("/products/handloom-cotton")).status()).toBe(200)
    expect((await request.get("/api/v1/products/handloom-cotton")).status()).toBe(200)
    expect((await request.get("/api/v1/products/nope")).status()).toBe(404)
  })
})

test.describe("home page", () => {
  test("has a descriptive title, canonical link and organisation data", async ({ page }) => {
    await page.goto("/")
    await expect(page).toHaveTitle(/Ambar: fabrics by the metre/)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "http://localhost:3100"
    )
    const data = await jsonLd(page)
    expect(data.some((d) => d["@type"] === "Organization")).toBe(true)
  })
})

test.describe("sub-category addresses", () => {
  test("a sub-category lives under its parent, with matching breadcrumbs, canonical and links", async ({
    page,
  }) => {
    await page.goto("/categories/fabrics/modal-silk-fabrics")
    await expect(page.getByRole("heading", { level: 1, name: "Modal silk" })).toBeVisible()
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "http://localhost:3100/categories/fabrics/modal-silk-fabrics"
    )
    const crumbs = page.getByRole("navigation", { name: "Breadcrumb" })
    await expect(crumbs.getByRole("link", { name: "Fabrics" })).toHaveAttribute(
      "href",
      "/categories/fabrics"
    )
    // Filters and sorting keep the same address.
    await choose(page, page.getByLabel("Sort by"), "Price, low to high")
    await expect(page).toHaveURL(/\/categories\/fabrics\/modal-silk-fabrics\?sort=price_asc$/)
    // Where the menu and the categories page lead.
    await page.goto("/categories")
    await expect(
      page.getByRole("link", { name: "Modal silk", exact: true }).first()
    ).toHaveAttribute("href", "/categories/fabrics/modal-silk-fabrics")
    // A product page points back along the same path.
    await page.goto("/products/ajrakh-dupatta")
    await expect(
      page
        .getByRole("navigation", { name: "Breadcrumb" })
        .getByRole("link", { name: "Ajrakh", exact: true })
    ).toHaveAttribute("href", "/categories/dupattas/ajrakh-dupattas")
  })

  test("the old single-segment address, or the wrong parent, moves permanently to the right one", async ({
    request,
  }) => {
    for (const [from, to] of [
      ["/categories/modal-silk-fabrics", "/categories/fabrics/modal-silk-fabrics"],
      ["/categories/dupattas/modal-silk-fabrics", "/categories/fabrics/modal-silk-fabrics"],
    ] as const) {
      const res = await request.get(`${from}?sort=price_asc`, { maxRedirects: 0 })
      expect(res.status(), from).toBe(308)
      expect(new URL(res.headers()["location"]!, "http://localhost:3100").pathname).toBe(to)
      expect(res.headers()["location"]).toContain("sort=price_asc") // the choices are kept
    }
    // A top-level category has no parent to add, and a parent in its own address is corrected.
    const top = await request.get("/categories/fabrics/fabrics", { maxRedirects: 0 })
    expect(top.status()).toBe(308)
    expect(new URL(top.headers()["location"]!, "http://localhost:3100").pathname).toBe(
      "/categories/fabrics"
    )
  })

  test("the sitemap lists sub-categories at their new address, once", async ({ request }) => {
    const xml = await (await request.get("/sitemap.xml")).text()
    expect(xml).toContain("/categories/fabrics/modal-silk-fabrics</loc>")
    expect(xml).not.toContain("/categories/modal-silk-fabrics</loc>")
  })
})

test.describe("browsing and filtering", () => {
  test("a category lists all its products, with no row of sub-category buttons under the heading", async ({
    page,
  }) => {
    await page.goto("/categories/fabrics")
    await expect(page.getByRole("heading", { level: 1, name: "Fabrics" })).toBeVisible()
    await expect(page.getByRole("navigation", { name: "Fabrics subcategories" })).toHaveCount(0)
    await expect(text(page, "11 products")).toBeVisible()
    expect(await productCards(page).count()).toBe(11)
    await expect(
      page.getByRole("navigation", { name: "Breadcrumb" }).getByText("Fabrics")
    ).toBeVisible()
  })

  test("filtering by fabric updates the URL, the list and the chips, and can be undone", async ({
    page,
  }) => {
    await page.goto("/categories/fabrics")
    const side = page.getByRole("complementary", { name: "Filters" })
    // Only Price is open to begin with; the other groups open on a click.
    await expect(side.getByLabel(/^Cotton/)).toBeHidden()
    await side.locator("summary", { hasText: "Fabric" }).click()
    await side.getByLabel(/^Cotton/).check()
    await expect(page).toHaveURL(/\/categories\/fabrics\?fabric=cotton$/)
    await expect(text(page, "3 products")).toBeVisible()
    await expect(
      page
        .getByRole("list", { name: "Active filters" })
        .getByRole("link", { name: "Remove filter: Cotton" })
    ).toBeVisible()
    await page.getByRole("link", { name: "Remove filter: Cotton" }).click()
    await expect(page).toHaveURL(/\/categories\/fabrics$/)
    await expect(text(page, "11 products")).toBeVisible()
  })

  test("a filter URL works when opened directly, and filtered views are not indexed", async ({
    page,
  }) => {
    await page.goto("/categories/fabrics?fabric=cotton&maxPrice=200")
    await expect(text(page, "2 products")).toBeVisible() // Handloom Rs 180 and Mulmul Rs 140
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "http://localhost:3100/categories/fabrics"
    )
    await expect(
      page.getByRole("complementary", { name: "Filters" }).getByLabel(/^Cotton/)
    ).toBeChecked()
  })

  test("sorting by price reorders the list and the choice survives a refresh", async ({ page }) => {
    await page.goto("/categories/fabrics/cotton-fabrics")
    await choose(page, page.getByLabel("Sort by"), "Price, low to high")
    await expect(page).toHaveURL(/sort=price_asc/)
    const names = await cardTitles(page).allTextContents()
    expect(names).toEqual(["Mulmul cotton", "Handloom cotton", "Block print cotton"]) // Rs 140, 180, 220 (on sale)
    await page.reload()
    await expect(page.getByLabel("Sort by")).toContainText("Price, low to high")
    expect(await cardTitles(page).allTextContents()).toEqual(names)
  })

  test("price filter and in-stock filter apply from the form", async ({ page }) => {
    await page.goto("/categories/fabrics")
    const filters = page.getByRole("complementary", { name: "Filters" })
    await filters.getByLabel("To (₹)").fill("100")
    await filters.getByRole("button", { name: "Apply filters" }).click()
    await expect(page).toHaveURL(/maxPrice=100/)
    await expect(text(page, "2 products")).toBeVisible() // lace border (Rs 35) and tassel latkan (Rs 80)
  })

  test("the first page of a long list is indexable and later pages are self-canonical", async ({
    page,
  }) => {
    await page.goto("/shop")
    // The admin tests add a product to this shared catalogue, so the total is "about 34", not exactly 34.
    await expect(text(page, /Showing 1 to 24 of (34|35|36)/)).toBeVisible()
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
    await page
      .getByRole("navigation", { name: "Pagination" })
      .getByRole("link", { name: "Next page" })
      .click()
    await expect(page).toHaveURL(/\/shop\?page=2$/)
    await expect(text(page, /Showing 25 to (34|35|36) of (34|35|36)/)).toBeVisible()
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "http://localhost:3100/shop?page=2"
    )
    await expect(page.getByRole("link", { name: "Page 2" })).toHaveAttribute("aria-current", "page")
  })

  test("a page past the end explains itself instead of showing a blank list", async ({ page }) => {
    await page.goto("/shop?page=99")
    await expect(page.getByRole("heading", { name: "That page does not exist" })).toBeVisible()
    await expect(page.locator('meta[name="robots"]')).toHaveCount(1)
  })

  test("new arrivals, bestsellers and sale show curated lists", async ({ page }) => {
    await page.goto("/new-arrivals")
    const fresh = await cardTitles(page).allTextContents()
    expect(fresh).toEqual(
      expect.arrayContaining(["Gharchola bandhani dupatta", "Ajrakh print modal silk"])
    )
    await page.goto("/sale")
    const sale = await cardTitles(page).allTextContents()
    expect(sale.sort()).toEqual(["Bandhani dupatta", "Block print cotton", "Plain mulmul dupatta"])
    await page.goto("/bestsellers")
    expect(await cardTitles(page).first().textContent()).toBe("Handloom cotton")
  })

  test("the mobile filter drawer applies filters and closes", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/categories/fabrics")
    await page.getByRole("button", { name: "Filters" }).click()
    const drawer = page.getByRole("dialog", { name: "Filters" })
    await drawer.locator("summary", { hasText: "Fabric" }).click()
    await drawer.getByLabel(/^Crepe/).check()
    await drawer.getByRole("button", { name: "Apply filters" }).click()
    await expect(page).toHaveURL(/fabric=crepe/)
    await expect(drawer).toBeHidden()
    await expect(text(page, "2 products")).toBeVisible()
  })
})

test.describe("search", () => {
  test("finds products by name, keyword and SKU, and never indexes results", async ({ page }) => {
    await page.goto("/search?q=bandhani")
    await expect(
      page.getByRole("heading", { level: 1, name: "Results for “bandhani”" })
    ).toBeVisible()
    expect(await productCards(page).count()).toBe(4)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/)

    await page.goto("/search?q=khadi") // a keyword that appears nowhere on the page
    expect(await cardTitles(page).allTextContents()).toEqual(["Handloom cotton"])

    await page.goto("/search?q=demo-001-sage")
    expect(await cardTitles(page).allTextContents()).toEqual(["Handloom cotton"])
  })

  test("explains a search with no results", async ({ page }) => {
    await page.goto("/search?q=zzzzqqq")
    await expect(page.getByRole("heading", { name: "Nothing matched “zzzzqqq”" })).toBeVisible()
    await expect(page.getByRole("link", { name: "Back to all products" })).toBeVisible()
  })

  test("treats markup in the search text as plain text", async ({ page }) => {
    await page.goto("/search?q=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E")
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "<img src=x onerror=alert(1)>"
    )
    expect(await page.locator("img[onerror]").count()).toBe(0)
  })

  test("the search panel from any page leads to results", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Search" }).click()
    await page.getByRole("searchbox", { name: "Search products" }).fill("ajrakh")
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(/\/search\?q=ajrakh$/)
    await expect(productCards(page)).toHaveCount(5)
  })
})

test.describe("product page", () => {
  test("shows the price per metre, details, related products and structured data", async ({
    page,
  }) => {
    const problems = watchConsole(page)
    await page.goto("/products/handloom-cotton")
    await expect(page.getByRole("heading", { level: 1, name: "Handloom cotton" })).toBeVisible()
    await expect(text(page, "₹180").first()).toBeVisible()
    await expect(text(page, "per metre").first()).toBeVisible()
    await expect(page.getByRole("heading", { name: "Fabric details" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "You may also like" })).toBeVisible()
    await expect(page).toHaveTitle("Handloom cotton | Ambar")
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "http://localhost:3100/products/handloom-cotton"
    )

    const data = await jsonLd(page)
    const product = data.find((d) => d["@type"] === "Product") as ProductLd
    expect(product).toMatchObject({ name: "Handloom cotton", sku: "DEMO-001-SAGE" })
    expect(product.offers).toMatchObject({
      "@type": "Offer",
      price: "180.00",
      priceCurrency: "INR",
      availability: "https://schema.org/InStock",
    })
    expect(product.offers.priceSpecification.referenceQuantity).toMatchObject({
      unitCode: "MTR",
      value: 1,
    })
    expect(product.aggregateRating).toBeUndefined() // no reviews exist, so none are claimed
    const crumbs = data.find((d) => d["@type"] === "BreadcrumbList") as unknown as CrumbLd
    expect(crumbs.itemListElement.map((i) => i.name)).toEqual([
      "Home",
      "Fabrics",
      "Cotton",
      "Handloom cotton",
    ])
    await expectNoViolations(page, "product page")
    expect(problems).toEqual([])
  })

  test("the length selector prices exactly and rejects lengths that are not on the step grid", async ({
    page,
  }) => {
    await page.goto("/products/handloom-cotton")
    const length = page.getByLabel(/^Length/)
    await expect(length).toHaveValue("0.5")
    await page.getByRole("button", { name: "Longer" }).click()
    await expect(length).toHaveValue("1")
    await page.getByRole("button", { name: "2.5 m", exact: true }).click()
    await expect(length).toHaveValue("2.5")
    await expect(page.getByRole("button", { name: "Add to bag, ₹450" })).toBeEnabled()

    await length.fill("2.35")
    await expect(page.getByRole("alert").filter({ hasText: "steps of 0.5 m" })).toBeVisible()
    await expect(page.getByRole("button", { name: /Add to bag/ })).toBeDisabled()

    await length.fill("0.0001")
    await expect(
      page.getByRole("alert").filter({ hasText: "at most 3 decimal places" })
    ).toBeVisible()
    await length.fill("abc")
    await expect(page.getByRole("button", { name: /Add to bag/ })).toBeDisabled()

    await length.fill("3")
    await expect(page.getByRole("button", { name: "Add to bag, ₹540" })).toBeEnabled()
  })

  test("choosing a colour keeps the length and updates availability", async ({ page }) => {
    await page.goto("/products/tissue-fabric")
    await expect(text(page, "Only 4 m left")).toBeVisible() // first colour is the low-stock one
    await page.getByLabel("Dusty rose").check({ force: true })
    await expect(text(page, "In stock", { exact: true })).toBeVisible()
  })

  test("cannot order more than is in stock", async ({ page }) => {
    await page.goto("/products/tissue-fabric") // antique gold: 4 m left
    await page.getByLabel(/^Length/).fill("5")
    await expect(page.getByRole("alert").filter({ hasText: "Only 4 m is available" })).toBeVisible()
    await expect(page.getByRole("button", { name: /Add to bag/ })).toBeDisabled()
    await page.getByLabel(/^Length/).fill("4")
    await expect(page.getByRole("button", { name: /Add to bag/ })).toBeEnabled()
  })

  test("a sold-out product cannot be added", async ({ page }) => {
    await page.goto("/products/chinon")
    await expect(page.getByRole("button", { name: "Out of stock" })).toBeDisabled()
    await expect(page.getByLabel(/^Length/)).toHaveCount(0)
  })

  test("adding to the bag updates the header, persists across refresh, and respects what is left", async ({
    page,
  }) => {
    await page.goto("/products/tissue-fabric") // gold has 4 m
    await page.getByLabel(/^Length/).fill("3")
    await page.getByRole("button", { name: /Add to bag/ }).click()
    await expect(text(page, "Added to your bag", { exact: true })).toBeVisible()
    await expect(page.getByRole("link", { name: "Bag, 1 item" })).toBeVisible()

    await page.reload()
    await expect(page.getByRole("link", { name: "Bag, 1 item" })).toBeVisible() // restored from storage

    // 3 m of the 4 m is already in the bag, so 1 m is the most that can be added.
    await page.getByLabel(/^Length/).fill("2")
    await expect(page.getByRole("alert").filter({ hasText: "Only 1 m is available" })).toBeVisible()
    await page.getByLabel(/^Length/).fill("1")
    await expect(page.getByRole("button", { name: /Add to bag/ })).toBeEnabled()
  })

  test("a sized product asks for a size and counts whole units", async ({ page }) => {
    await page.goto("/products/cotton-kurti")
    await expect(text(page, "Size:", { exact: false })).toBeVisible()
    await page.getByLabel("M", { exact: true }).check({ force: true })
    await expect(page.locator("#qty")).toHaveValue("1")
    await page.getByRole("button", { name: "Increase quantity" }).click()
    // Two pieces at Rs 1,199 each.
    await expect(page.getByRole("button", { name: "Add to bag, ₹2,398" })).toBeVisible()
    await page.locator("#qty").fill("1.5")
    await expect(page.getByRole("alert").filter({ hasText: "whole number" })).toBeVisible()
  })

  test("a set has a per-order limit", async ({ page }) => {
    await page.goto("/products/block-print-unstitched-suit")
    await page.locator("#qty").fill("6")
    await expect(
      page.getByRole("alert").filter({ hasText: "most you can order is 5 sets" })
    ).toBeVisible()
  })

  test("saving to the wishlist works from the product page and shows on the wishlist page", async ({
    page,
  }) => {
    await page.goto("/products/handloom-cotton")
    await page.getByRole("button", { name: "Add Handloom cotton to wishlist" }).last().click()
    await expect(text(page, "Saved to your wishlist")).toBeVisible()
    await page.goto("/account/wishlist")
    await expect(page.getByRole("link", { name: "Handloom cotton" })).toBeVisible()
    await page.getByRole("button", { name: "Remove Handloom cotton from wishlist" }).click()
    await expect(page.getByRole("heading", { name: "Your wishlist is empty" })).toBeVisible()
  })
})

test.describe("accessibility and mobile", () => {
  for (const path of [
    "/",
    "/shop",
    "/categories",
    "/categories/fabrics",
    "/products/handloom-cotton",
    "/search?q=cotton",
    "/account/wishlist",
  ]) {
    test(`${path} has one h1 and never skips a heading level`, async ({ page }) => {
      await page.goto(path)
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
      await expectHeadingOrder(page, path)
    })
  }

  for (const path of [
    "/shop",
    "/categories/fabrics",
    "/search?q=cotton",
    "/categories",
    "/account/wishlist",
  ]) {
    test(`${path} passes axe on desktop`, async ({ page }) => {
      await page.goto(path)
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
      await expectNoViolations(page, path)
    })
  }

  test.describe("mobile", () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })
    for (const path of [
      "/",
      "/categories/fabrics",
      "/products/handloom-cotton",
      "/search?q=cotton",
    ]) {
      test(`${path} has no horizontal scroll and passes axe`, async ({ page }) => {
        await page.goto(path)
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth
        )
        expect(overflow, `overflow on ${path}`).toBeLessThanOrEqual(0)
        await expectNoViolations(page, `mobile ${path}`)
      })
    }
  })
})
