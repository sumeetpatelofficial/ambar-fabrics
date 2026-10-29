import type { Page } from "@playwright/test"
import { E2E_STORE, E2E_SUPPORT } from "./accounts"
import { choose, expect, expectNoViolations, label, otherDevice, test } from "./helpers"

async function signInAs(page: Page, who: { email: string; password: string }) {
  await page.goto("/login")
  await label(page, "Email address").fill(who.email)
  await label(page, "Password", { exact: true }).fill(who.password)
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await expect(page).toHaveURL((url) => !url.pathname.startsWith("/login"))
}

/** "11.5 m in stock" in the first result for the search, as a number of metres. */
async function stockOfFirstResult(page: Page, search: string) {
  await page.goto("/admin/orders/new")
  await label(page, "Find an item").fill(search)
  const first = page.getByRole("list", { name: "Search results" }).getByRole("listitem").first()
  await expect(first).toBeVisible()
  const match = /([\d.]+) m in stock/.exec((await first.textContent()) ?? "")
  expect(match, "stock text").not.toBeNull()
  return Number(match![1])
}

test.describe("recording a sale made in the shop", () => {
  test("add order, discount, pay by UPI, see the bill, then void it and get the stock back", async ({
    page,
  }) => {
    await signInAs(page, E2E_STORE)
    const before = await stockOfFirstResult(page, "Handloom cotton")

    await page.goto("/admin/orders")
    await page.getByRole("link", { name: "Add order" }).click()
    await expect(page.getByRole("heading", { level: 1, name: "Add order" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Record sale" })).toBeDisabled()

    await label(page, "Find an item").fill("Handloom cotton")
    const sage = page.getByRole("button", { name: "Add Handloom cotton, Sage" })
    await sage.click()
    await expect(sage).toHaveText("Added")

    const length = page.getByRole("textbox", { name: /Length in metres: Handloom cotton, Sage/ })
    await length.fill("2.5")
    // ₹180 a metre for 2.5 m.
    await expect(page.getByRole("term").filter({ hasText: "Total" })).toBeVisible()
    await expect(page.locator("dd", { hasText: "₹450" }).last()).toBeVisible()

    // A length the cloth is not cut in is explained, and blocks the sale.
    await length.fill("2.55")
    await expect(page.getByRole("alert").filter({ hasText: /steps of/ })).toBeVisible()
    await expect(page.getByRole("button", { name: "Record sale" })).toBeDisabled()
    await length.fill("2.5")

    await page.getByRole("checkbox", { name: "Give a discount on the whole bill" }).check()
    await choose(page, page.getByRole("combobox", { name: "In" }), "Percent")
    await label(page, "Discount (%)").fill("10")
    // A reason is needed before the sale can be recorded.
    await expect(page.getByRole("button", { name: "Record sale" })).toBeDisabled()
    await label(page, "Why is it given?").fill("Regular customer")
    await expect(page.locator("dd", { hasText: "₹405" })).toBeVisible()

    await label(page, "Customer name (optional)").fill("Meera")
    await label(page, "Phone (optional)").fill("98765 43210")
    await choose(page, page.getByRole("combobox", { name: "Paid by" }), "UPI")
    await expectNoViolations(page, "/admin/orders/new")

    await page.getByRole("button", { name: "Record sale" }).click()
    await expect(page).toHaveURL(/\/admin\/orders\/AM-/)
    await expect(page.getByRole("heading", { level: 1, name: /^Order AM-/ })).toBeVisible()
    await expect(page.getByText("sold in the shop, paid by UPI")).toBeVisible()
    await expect(page.getByText("Meera, phone +919876543210")).toBeVisible()
    // Nothing to ship and nothing to refund online.
    await expect(page.getByRole("button", { name: "Book courier" })).toHaveCount(0)
    await expect(page.getByRole("form", { name: "Refund" })).toHaveCount(0)

    // The bill is ready, and has no delivery address.
    await page.getByRole("link", { name: "Open the invoice" }).click()
    await expect(page.getByText("Bill of Supply").first()).toBeVisible()
    await expect(page.getByText("Paid in the shop by UPI")).toBeVisible()
    await expect(page.getByText("Billed to")).toBeVisible()
    await page.goBack()

    // It is listed, tagged and filterable.
    await page.goto("/admin/orders?show=in_store")
    await expect(page.getByRole("link", { name: /^AM-/ }).first()).toBeVisible()
    await expect(page.getByText("In store").first()).toBeVisible()

    // The stock came off.
    expect(await stockOfFirstResult(page, "Handloom cotton")).toBeCloseTo(before - 2.5, 3)

    // Voiding it by mistake-correction puts the stock back.
    await page.goto("/admin/orders?show=in_store")
    await page.getByRole("link", { name: /^AM-/ }).first().click()
    const void_ = page.getByRole("form", { name: "Void this sale" })
    await label(page, "Why is it being voided?").fill("Wrong colour")
    await void_.getByRole("button", { name: "Void sale" }).click()
    await expect(page.getByText(/^Refunded|Cancelled/).first()).toBeVisible()
    await expect(void_).toHaveCount(0)
    expect(await stockOfFirstResult(page, "Handloom cotton")).toBeCloseTo(before, 3)
  })

  test("support sees no Add order button and cannot open the page", async ({ browser }) => {
    const context = await otherDevice(browser)
    const support = await context.newPage()
    await signInAs(support, E2E_SUPPORT)
    await support.goto("/admin/orders")
    await expect(support.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible()
    await expect(support.getByRole("link", { name: "Add order" })).toHaveCount(0)
    await support.goto("/admin/orders/new")
    await expect(
      support.getByRole("heading", {
        name: /We could not find that page|That admin page does not exist/,
      })
    ).toBeVisible()
    await context.close()
  })
})
