import type { Page } from "@playwright/test"
import { expect, expectNoViolations, test, watchConsole } from "./helpers"

const filters = (page: Page) => page.getByRole("complementary", { name: "Filters" })

test.describe("the filter sidebar", () => {
  test.use({ viewport: { width: 1280, height: 720 } })

  test("stays in view while the page scrolls, and scrolls inside when it is taller than the screen", async ({
    page,
  }) => {
    await page.goto("/shop")
    const panel = filters(page).locator("> div")
    const before = await panel.boundingBox()
    expect(before).not.toBeNull()
    await page.evaluate(() => window.scrollTo(0, 900))
    await expect.poll(async () => Math.round((await panel.boundingBox())!.y)).toBeLessThan(120)
    const after = (await panel.boundingBox())!
    expect(after.y).toBeGreaterThanOrEqual(60) // just under the header
    expect(after.y + after.height).toBeLessThanOrEqual(720) // never taller than the screen

    // Every control is still reachable: with the groups opened the panel is taller than the screen
    // and scrolls on its own.
    for (const group of ["Fabric", "Colour", "Pattern"])
      await filters(page).locator("summary", { hasText: group }).click()
    const overflow = await panel.evaluate((el) => el.scrollHeight > el.clientHeight)
    expect(overflow).toBe(true)
    const apply = filters(page).getByRole("button", { name: "Apply filters" })
    await apply.scrollIntoViewIfNeeded()
    await expect(apply).toBeInViewport()
  })
})

test.describe("the price slider", () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test("has two handles, moves with the keyboard, and filters the list", async ({ page }) => {
    const problems = watchConsole(page)
    await page.goto("/categories/fabrics")
    const side = filters(page)
    const low = side.getByRole("slider", { name: "Lowest price" })
    const high = side.getByRole("slider", { name: "Highest price" })
    await expect(low).toBeVisible()
    await expect(high).toBeVisible()
    // Untouched, the handles sit at the two ends: the cheapest and dearest prices in this list.
    const min = Number(await low.getAttribute("aria-valuenow"))
    const max = Number(await high.getAttribute("aria-valuenow"))
    expect(max).toBeGreaterThan(min + 100)
    await expectNoViolations(page, "price slider")

    // Page Up on the lowest handle: ten rupees up, applied to the address and the list.
    await low.focus()
    await low.press("PageUp")
    await expect(page).toHaveURL(new RegExp(`minPrice=${min + 10}(&|$)`))
    await expect(side.getByRole("spinbutton", { name: "From (₹)" })).toHaveValue(String(min + 10))
    await expect(side.getByRole("slider", { name: "Lowest price" })).toHaveAttribute(
      "aria-valuenow",
      String(min + 10)
    )

    // Page Down on the highest handle.
    const high2 = side.getByRole("slider", { name: "Highest price" })
    await high2.focus()
    await high2.press("PageDown")
    await expect(page).toHaveURL(new RegExp(`maxPrice=${max - 10}(&|$)`))
    await expect(side.getByRole("spinbutton", { name: "To (₹)" })).toHaveValue(String(max - 10))

    // The handles cannot cross: pushing the lowest past the highest moves them together.
    const low2 = side.getByRole("slider", { name: "Lowest price" })
    await low2.focus()
    await low2.press("End")
    await expect
      .poll(async () => Number(await low2.getAttribute("aria-valuenow")))
      .toBeLessThanOrEqual(max)

    // Clearing puts both handles back at the ends and the numbers back to empty.
    await page.goto("/categories/fabrics")
    await expect(side.getByRole("slider", { name: "Lowest price" })).toHaveAttribute(
      "aria-valuenow",
      String(min)
    )
    expect(problems).toEqual([])
  })

  test("a handle can be dragged with the mouse", async ({ page }) => {
    await page.goto("/categories/fabrics")
    const side = filters(page)
    const high = side.getByRole("slider", { name: "Highest price" })
    const max = Number(await high.getAttribute("aria-valuenow"))
    const thumb = high.locator("xpath=..")
    await thumb.scrollIntoViewIfNeeded()
    const box = (await thumb.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x - 90, box.y + box.height / 2, { steps: 8 })
    await page.mouse.up()
    await expect(page).toHaveURL(/maxPrice=\d+/)
    const now = Number(new URL(page.url()).searchParams.get("maxPrice"))
    expect(now).toBeLessThan(max)
    await expect(side.getByRole("spinbutton", { name: "To (₹)" })).toHaveValue(String(now))
  })

  test("typing exact prices still works and moves the handles", async ({ page }) => {
    await page.goto("/categories/fabrics")
    const side = filters(page)
    await side.getByRole("spinbutton", { name: "To (₹)" }).fill("200")
    await side.getByRole("spinbutton", { name: "To (₹)" }).blur()
    await expect(page).toHaveURL(/maxPrice=200/)
    await expect(side.getByRole("slider", { name: "Highest price" })).toHaveAttribute(
      "aria-valuenow",
      "200"
    )
  })
})

// The add-to-bag controls on list cards are switched off in ProductGrid (it no longer passes `footer`), so these
// tests are skipped. Turn them back on together with the controls.
test.describe.skip("adding from a list card", () => {
  const card = (page: Page, name: string) =>
    page.locator("article").filter({ hasText: name }).filter({ visible: true }).first()

  test("choose an option and a length, add it, and it is in the bag", async ({ page }) => {
    const problems = watchConsole(page)
    await page.goto("/categories/fabrics/cotton-fabrics")
    const c = card(page, "Handloom cotton")
    const length = c.getByLabel("Length in metres: Handloom cotton")
    await expect(length).toHaveValue("0.5")
    await c.getByRole("button", { name: "Longer: Handloom cotton" }).click()
    await c.getByRole("button", { name: "Longer: Handloom cotton" }).click()
    await expect(length).toHaveValue("1.5")
    await c.getByRole("button", { name: "Add Handloom cotton to bag" }).click()
    await expect(page.getByRole("link", { name: /^Bag, \d+ items?$/ })).toBeVisible()
    await expect(page.getByText("Added to your bag").first()).toBeVisible()
    await page.goto("/cart")
    await expect(page.getByRole("heading", { name: /Handloom cotton/ }).first()).toBeVisible()
    await expect(page.getByText("1.5 m").first()).toBeVisible()
    expect(problems.filter((p) => !/404/.test(p))).toEqual([])
  })

  test("refuses a length the shop cannot cut, and counts pieces for ready-made things", async ({
    page,
  }) => {
    await page.goto("/categories/fabrics/cotton-fabrics")
    const c = card(page, "Handloom cotton")
    const length = c.getByLabel("Length in metres: Handloom cotton")
    await length.fill("0.3")
    await expect(c.getByRole("alert")).toBeVisible()
    await expect(c.getByRole("button", { name: "Add Handloom cotton to bag" })).toBeDisabled()
    await length.fill("2")
    await expect(c.getByRole("button", { name: "Add Handloom cotton to bag" })).toBeEnabled()

    await page.goto("/categories/ready-made/kurtis")
    const k = card(page, "Anarkali kurti")
    const qty = k.getByLabel("Quantity: Anarkali kurti")
    await expect(qty).toHaveValue("1")
    await k.getByRole("button", { name: "More: Anarkali kurti" }).click()
    await expect(qty).toHaveValue("2")
    await k.getByRole("button", { name: "Add Anarkali kurti to bag" }).click()
    await page.goto("/cart")
    await expect(page.getByRole("heading", { name: /Anarkali kurti/ }).first()).toBeVisible()
    await expect(page.getByText("2 pieces").first()).toBeVisible()
  })

  test("a sold-out card keeps its controls, all switched off; the product page has no duplicate controls", async ({
    page,
  }) => {
    await page.goto("/categories/fabrics/chinon-fabrics")
    const sold = card(page, "Chinon")
    await expect(sold.getByText("Sold out")).toBeVisible()
    await expect(sold.getByRole("button", { name: "Add Chinon to bag" })).toBeDisabled()
    await expect(sold.getByLabel("Length in metres: Chinon")).toBeDisabled()
    await expect(sold.getByRole("button", { name: "Longer: Chinon" })).toBeDisabled()
    await expect(sold.getByRole("button", { name: "Shorter: Chinon" })).toBeDisabled()
    await expect(sold.getByRole("alert")).toHaveCount(0)
    await expectNoViolations(page, "sold-out card")
    await page.goto("/products/handloom-cotton")
    await expect(page.getByRole("button", { name: /Add to bag/ })).toHaveCount(1)
    await expectNoViolations(page, "product page")
    await page.goto("/categories/fabrics/cotton-fabrics")
    await expectNoViolations(page, "listing with quick add")
  })
})
