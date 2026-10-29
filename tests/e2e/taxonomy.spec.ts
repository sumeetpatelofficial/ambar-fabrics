import type { Page } from "@playwright/test"
import { E2E_MASTER } from "./accounts"
import { choose, expect, expectNoViolations, label, test, watchConsole } from "./helpers"

async function signIn(page: Page) {
  await page.goto("/login")
  await label(page, "Email address").fill(E2E_MASTER.email)
  await label(page, "Password", { exact: true }).fill(E2E_MASTER.password)
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await expect(page).toHaveURL((url) => !url.pathname.startsWith("/login"))
}

test.describe("fabrics and prints in the shop", () => {
  test("a fabric page lists everything made of it, across categories, and products link back", async ({
    page,
  }) => {
    const problems = watchConsole(page)
    await page.goto("/fabrics")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    await page
      .getByRole("link", { name: /^Cotton/ })
      .first()
      .click()
    await expect(page).toHaveURL(/\/fabrics\/cotton$/)
    await expect(page.getByRole("heading", { level: 1, name: "Cotton" })).toBeVisible()
    // Cloth, dupattas, blouses and kurtis all appear on the one page.
    for (const name of ["Handloom cotton", "Cotton blouse", "Cotton kurti"])
      await expect(page.getByRole("link", { name: new RegExp(name) }).first()).toBeVisible()
    await expectNoViolations(page, "fabric page")

    await page.goto("/prints/ajrakh")
    await expect(page.getByRole("heading", { level: 1, name: "Ajrakh" })).toBeVisible()
    await expect(page.getByRole("link", { name: /Ajrakh dupatta/ }).first()).toBeVisible()
    await expect(page.getByRole("link", { name: /Ajrakh cotton stole/ }).first()).toBeVisible()

    // A product page links to its fabric and print.
    await page.goto("/products/ajrakh-dupatta")
    await page.getByRole("link", { name: "Modal silk" }).first().click()
    await expect(page).toHaveURL(/\/fabrics\/modal-silk$/)
    expect(problems).toEqual([])
  })

  test("an unknown fabric or print is a not-found page", async ({ page }) => {
    for (const path of ["/fabrics/not-a-fabric", "/prints/not-a-print", "/fabrics/ajrakh"]) {
      const response = await page.goto(path)
      expect(response?.status(), path).toBe(404)
    }
  })
})

test.describe("arranging the shop from the admin", () => {
  test("add a fabric, use it on a product, rename it, and it cannot be deleted while used", async ({
    page,
  }) => {
    const stamp = Date.now().toString(36)
    const name = `Linen ${stamp}`
    await signIn(page)
    await page.goto("/admin/fabrics/new")
    await label(page, "Name").fill(name)
    await page.getByRole("button", { name: "Save fabric" }).click()
    await expect(page).toHaveURL(/\/admin\/fabrics/)
    await expect(page.getByText(name).first()).toBeVisible()

    // Choose it on a product.
    await page.goto("/admin/products?q=plain+mulmul+dupatta")
    await page
      .getByRole("link", { name: /Plain mulmul dupatta/ })
      .first()
      .click()
    await choose(page, label(page, "Fabric"), name)
    await page.getByRole("button", { name: /^Save/ }).first().click()
    await expect(page.getByText(/saved/i).first()).toBeVisible()

    // It is shown in the shop, and deleting it is refused while it is used.
    await page.goto(`/fabrics/linen-${stamp}`)
    await expect(page.getByRole("link", { name: /Plain mulmul dupatta/ }).first()).toBeVisible()
    await page.goto("/admin/fabrics")
    await page.getByRole("button", { name: `Delete ${name}` }).click()
    await expect(page.getByRole("status").filter({ hasText: /used by/i })).toBeVisible()
    await expect(page.getByText(name).first()).toBeVisible()
  })

  test("a fabric moves up and down, and the order is kept after reload", async ({ page }) => {
    await signIn(page)
    await page.goto("/admin/prints")
    const rows = page.getByRole("button", { name: /^Move .* down$/ })
    const firstName = (await page
      .getByRole("button", { name: /^Drag / })
      .first()
      .getAttribute("aria-label"))!.replace("Drag ", "")
    await page.getByRole("button", { name: `Move ${firstName} down` }).click()
    await expect(page.getByRole("status").filter({ hasText: /saved/i })).toBeVisible()
    await page.reload()
    const after = await page
      .getByRole("button", { name: /^Drag / })
      .first()
      .getAttribute("aria-label")
    expect(after).not.toBe(`Drag ${firstName}`)
    await expect(rows.first()).toBeVisible()
    // Put it back so other tests see the original order.
    await page.getByRole("button", { name: `Move ${firstName} up` }).click()
    await expect(page.getByRole("status").filter({ hasText: /saved/i })).toBeVisible()
  })

  test("a sub-category moves under another parent with the menu, and is saved", async ({
    page,
  }) => {
    await signIn(page)
    await page.goto("/admin/categories")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    await expectNoViolations(page, "categories tree")
    // A sub-category is the one whose menu is not on "Top level". Lift it to the top and put it back.
    const menus = page.locator("button[id^='under-']:visible")
    const count = await menus.count()
    let id = ""
    let where = ""
    for (let i = 0; i < count; i++) {
      // The arrow glyph is part of the button's text; the choice is what comes before it.
      const shown = ((await menus.nth(i).textContent()) ?? "").replace("▼", "").trim()
      if (shown !== "Top level") {
        id = (await menus.nth(i).getAttribute("id"))!
        where = shown
        break
      }
    }
    expect(id, "the sample shop has sub-categories").not.toBe("")
    const menu = page.locator(`#${id}:visible`)
    const saved = page.getByRole("status").filter({ hasText: "Order saved." })
    await choose(page, menu, "Top level")
    await expect(saved).toBeVisible()
    await page.reload()
    await expect(menu).toContainText("Top level")
    await choose(page, menu, where)
    await expect(saved).toBeVisible()
    await page.reload()
    await expect(menu).toContainText(where)
  })

  test("dragging a print with the mouse reorders it and the order is saved", async ({ page }) => {
    await signIn(page)
    await page.goto("/admin/prints")
    const handles = page.getByRole("button", { name: /^Drag / })
    const names = async () =>
      await handles.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")!.slice(5)))
    const before = await names()
    const from = (await handles.first().boundingBox())!
    const to = (await handles.nth(1).boundingBox())!
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 12, { steps: 4 })
    await page.mouse.move(to.x + to.width / 2, to.y + to.height + 6, { steps: 12 })
    await page.mouse.up()
    await expect(page.getByRole("status").filter({ hasText: /saved/i })).toBeVisible()
    expect((await names()).slice(0, 2)).toEqual([before[1], before[0]])
    await page.reload()
    expect((await names()).slice(0, 2)).toEqual([before[1], before[0]])
    // Put it back.
    await page.getByRole("button", { name: `Move ${before[0]} up` }).click()
    await expect(page.getByRole("status").filter({ hasText: /saved/i })).toBeVisible()
  })
})
