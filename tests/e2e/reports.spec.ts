import type { Page } from "@playwright/test"
import { E2E_REPORTS } from "./accounts"
import { expect, expectNoViolations, label, test } from "./helpers"

async function signIn(page: Page) {
  await page.goto("/login")
  await label(page, "Email address").fill(E2E_REPORTS.email)
  await label(page, "Password", { exact: true }).fill(E2E_REPORTS.password)
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await expect(page).toHaveURL((url) => !url.pathname.startsWith("/login"))
}

test.describe("admin reports", () => {
  test("the menu lists Reports, Fabrics and Prints, and the report page works", async ({
    page,
  }) => {
    await signIn(page)
    await page.goto("/admin")
    const menu = page.getByRole("navigation", { name: "Admin" })
    for (const name of ["Reports", "Fabrics", "Prints"])
      await expect(menu.getByRole("link", { name }), name).toBeVisible()

    await menu.getByRole("link", { name: "Reports" }).click()
    await expect(page.getByRole("heading", { level: 1, name: "Reports" })).toBeVisible()
    for (const name of [
      "Summary",
      "Sales by day",
      "Best-selling products",
      "Sales by category",
      "Sales by fabric",
      "Sales by print",
      "Where orders go",
      "Coupons used",
      "Orders started and how they ended",
      "Who bought",
      "After the sale",
    ])
      await expect(page.getByRole("heading", { level: 2, name }), name).toBeVisible()
    await expect(page.getByText("Only paid orders count as sales.")).toBeVisible()
    await expectNoViolations(page, "/admin/reports")

    // A quick choice changes the period; an invalid one is explained instead of failing.
    await page.getByRole("link", { name: "Last 7 days" }).click()
    await expect(page).toHaveURL(/from=\d{4}-\d{2}-\d{2}&to=/)
    await expect(page.locator("p:visible", { hasText: /\(7 days\)/ })).toBeVisible()
    await page.goto("/admin/reports?from=garbage&to=2026-01-01")
    await expect(page.getByRole("status").filter({ hasText: "not understood" })).toBeVisible()
    await page.goto("/admin/reports?from=2026-01-01&to=2026-01-01")
    await expect(page.getByText(/\(1 day\)/)).toBeVisible()

    // The date form.
    await page.goto("/admin/reports")
    await label(page, "From", { exact: true }).fill("2026-03-01")
    await label(page, "To", { exact: true }).fill("2026-03-31")
    await page.getByRole("button", { name: "Show report" }).click()
    await expect(page).toHaveURL(/from=2026-03-01&to=2026-03-31/)
    await expect(page.locator("p:visible", { hasText: /\(31 days\)/ })).toBeVisible()
  })

  test("spreadsheets download for staff, and are a plain 404 for everyone else", async ({
    page,
    request,
  }) => {
    const signedOut = await request.get("/admin/reports/export?report=daily", { maxRedirects: 0 })
    expect([307, 308, 404]).toContain(signedOut.status()) // sent to sign in, never the spreadsheet
    expect(signedOut.headers()["content-type"] ?? "").not.toContain("text/csv")
    await signIn(page)
    const ok = await page.request.get(
      "/admin/reports/export?report=fabrics&from=2026-03-01&to=2026-03-31"
    )
    expect(ok.status()).toBe(200)
    expect(ok.headers()["content-type"]).toContain("text/csv")
    expect(ok.headers()["content-disposition"]).toContain(
      "ambar-fabrics-2026-03-01-to-2026-03-31.csv"
    )
    expect((await ok.text()).split("\n")[0]).toBe("Fabric,Order lines,Item sales (Rs),Profit (Rs)")
    const bad = await page.request.get("/admin/reports/export?report=everything")
    expect(bad.status()).toBe(404)
  })
})
