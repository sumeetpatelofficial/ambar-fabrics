import type { Page } from "@playwright/test"
import { expect, expectNoViolations, E2E_GA_ID, test } from "./helpers"

type GaCall = [string, string, Record<string, unknown>]

/** What the page has told Google Analytics, from the data layer (`gtag` pushes argument lists). */
async function calls(page: Page): Promise<GaCall[]> {
  return page.evaluate(
    () =>
      ((window as unknown as { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? [])
        .map((a) => Array.from(a))
        .filter((a) => a[0] === "event") as unknown as GaCall[]
  )
}
const named = async (page: Page, name: string) => (await calls(page)).filter((c) => c[1] === name)

function watchGoogle(page: Page) {
  const seen: string[] = []
  page.on("request", (r) => {
    if (/googletagmanager\.com|google-analytics\.com/.test(r.url())) seen.push(r.url())
  })
  return seen
}

test.describe("a new visitor", () => {
  test.use({ consent: "unset" })

  test("is asked once, and nothing is sent to Google until they agree", async ({ page }) => {
    const google = watchGoogle(page)
    await page.goto("/")
    const banner = page.getByRole("region", { name: "Help us see what is popular" })
    await expect(banner).toBeVisible()
    await expect(banner.getByRole("button", { name: "No thanks" })).toBeVisible()
    await expect(banner.getByRole("button", { name: "Accept analytics" })).toBeVisible()
    await expectNoViolations(page, "consent banner")

    // Browsing without answering sends nothing and records nothing.
    await page.goto("/shop")
    await page.goto("/products/handloom-cotton")
    expect(google).toEqual([])
    expect(
      await page.evaluate(() => (window as unknown as { gtag?: unknown }).gtag)
    ).toBeUndefined()
    expect(await calls(page)).toEqual([])
    expect(await page.locator("#ga-script").count()).toBe(0)
  })

  test("saying no hides the banner for good and still sends nothing", async ({ page }) => {
    const google = watchGoogle(page)
    await page.goto("/")
    await page.getByRole("button", { name: "No thanks" }).click()
    await expect(page.getByRole("region", { name: "Help us see what is popular" })).toHaveCount(0)
    await page.goto("/products/handloom-cotton")
    await page.getByRole("button", { name: /Add to bag/ }).click()
    await page.reload()
    await expect(page.getByRole("region", { name: "Help us see what is popular" })).toHaveCount(0)
    expect(google).toEqual([])
    expect(await calls(page)).toEqual([])
  })

  test("saying yes loads Google Analytics and reports what they do, then they can change their mind", async ({
    page,
    context,
  }) => {
    const google = watchGoogle(page)
    await page.goto("/")
    await page.getByRole("button", { name: "Accept analytics" }).click()
    await expect(page.getByRole("region", { name: "Help us see what is popular" })).toHaveCount(0)
    await expect.poll(() => google.some((u) => u.includes(`id=${E2E_GA_ID}`))).toBe(true)
    await expect.poll(async () => (await named(page, "page_view")).length).toBeGreaterThan(0)

    // The first page view is for this page.
    expect((await named(page, "page_view"))[0]![2]).toMatchObject({ page_path: "/" })

    // A product page: view_item with the product's web address as its id and a price in rupees.
    await page.goto("/products/handloom-cotton")
    await expect.poll(async () => (await named(page, "view_item")).length).toBe(1)
    const viewItem = (await named(page, "view_item"))[0]![2] as {
      currency: string
      items: { item_id: string; price: number; quantity: number }[]
    }
    expect(viewItem.currency).toBe("INR")
    expect(viewItem.items[0]).toMatchObject({ item_id: "handloom-cotton", quantity: 1 })
    expect(viewItem.items[0]!.price).toBeGreaterThan(0)

    // Adding 2.5 metres: quantity is metres and price is per metre, so price x quantity is the line total.
    await page.getByLabel(/^Length/).fill("2.5")
    await page.getByRole("button", { name: /Add to bag/ }).click()
    await expect.poll(async () => (await named(page, "add_to_cart")).length).toBe(1)
    const add = (await named(page, "add_to_cart"))[0]![2] as {
      value: number
      items: { quantity: number; price: number }[]
    }
    expect(add.items[0]!.quantity).toBe(2.5)
    expect(add.items[0]!.price * 2.5).toBeCloseTo(add.value, 2)
    expect(add.value).toBe(450) // the same Rs 450 the checkout test pays for

    // The bag and a removal.
    await page.goto("/cart")
    await expect.poll(async () => (await named(page, "view_cart")).length).toBe(1)
    expect(((await named(page, "view_cart"))[0]![2] as { value: number }).value).toBe(450)
    await page
      .getByRole("button", { name: /^Remove/ })
      .first()
      .click()
    await expect.poll(async () => (await named(page, "remove_from_cart")).length).toBe(1)

    // Changing their mind stops reports and clears Google's cookies.
    await context.addCookies([
      { name: "_ga", value: "GA1.1.1", url: "http://localhost:3100" },
      { name: "_ga_E2ETEST01", value: "GS1.1.1", url: "http://localhost:3100" },
    ])
    await page.goto("/")
    await page.getByRole("button", { name: "Cookie settings" }).click()
    const banner = page.getByRole("region", { name: "Help us see what is popular" })
    await expect(banner).toBeVisible()
    await expect(banner.getByRole("heading")).toBeFocused() // focus moves to what was opened
    await banner.getByRole("button", { name: "No thanks" }).click()
    await expect
      .poll(async () => (await context.cookies()).filter((c) => c.name.startsWith("_ga")).length)
      .toBe(0)
    await page.goto("/shop")
    expect(await calls(page)).toEqual([]) // a fresh page: nothing is recorded any more
  })
})

test.describe("a visitor who agreed", () => {
  test.use({ consent: "granted" })

  test("browsing lists and searching are reported with the list name and positions", async ({
    page,
  }) => {
    await page.goto("/shop")
    await expect.poll(async () => (await named(page, "view_item_list")).length).toBe(1)
    const list = (await named(page, "view_item_list"))[0]![2] as {
      item_list_name: string
      items: { item_id: string; index: number; item_list_name: string }[]
    }
    expect(list.item_list_name).toBe("/shop")
    expect(list.items.length).toBeGreaterThan(3)
    expect(list.items.map((i) => i.index)).toEqual(list.items.map((_, i) => i))

    // Choosing a card reports which one.
    const first = list.items[0]!.item_id
    await page.locator(`a[href="/products/${first}"]`).first().click()
    await expect(page).toHaveURL(new RegExp(`/products/${first}$`))
    const picked = await named(page, "select_item")
    expect(picked).toHaveLength(1)
    expect(picked[0]![2]).toMatchObject({
      item_list_name: "/shop",
      items: [{ item_id: first, index: 0 }],
    })

    await page.goto("/search?q=cotton")
    await expect.poll(async () => (await named(page, "view_search_results")).length).toBe(1)
    expect((await named(page, "search"))[0]![2]).toEqual({ search_term: "cotton" })
    expect(
      ((await named(page, "view_search_results"))[0]![2] as { result_count: number }).result_count
    ).toBeGreaterThan(0)
  })

  test("a wishlist add is reported", async ({ page }) => {
    await page.goto("/products/handloom-cotton")
    await page
      .getByRole("button", { name: /wishlist/i })
      .first()
      .click()
    await expect.poll(async () => (await named(page, "add_to_wishlist")).length).toBe(1)
    expect((await named(page, "add_to_wishlist"))[0]![2]).toMatchObject({
      currency: "INR",
      items: [{ item_id: "handloom-cotton" }],
    })
  })
})

test.describe("when analytics is not set up", () => {
  test("the footer has a cookie settings button because the test site is set up", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(page.getByRole("button", { name: "Cookie settings" })).toBeVisible()
  })
})
