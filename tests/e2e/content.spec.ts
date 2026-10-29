import type { Page } from "@playwright/test"
import { E2E_EDITOR } from "./accounts"
import {
  expect,
  expectHeadingOrder,
  expectNoViolations,
  label,
  test,
  text,
  watchConsole,
} from "./helpers"

const INFO_PAGES = [
  ["/shipping-policy", "Shipping"],
  ["/return-refund-policy", "Returns and refunds"],
  ["/privacy-policy", "Privacy policy"],
  ["/terms-and-conditions", "Terms and conditions"],
  ["/faq", "Questions and answers"],
  ["/about", "About us"],
  ["/contact", "Contact us"],
  ["/track-order", "Track your order"],
] as const

async function signInEditor(page: Page) {
  await page.goto("/login")
  await label(page, "Email address").fill(E2E_EDITOR.email)
  await label(page, "Password", { exact: true }).fill(E2E_EDITOR.password)
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await expect(page).toHaveURL((url) => !url.pathname.startsWith("/login"))
}

test.describe("information pages", () => {
  for (const [path, title] of INFO_PAGES) {
    test(`${path} is a real page: one heading, no accessibility violations, no console errors`, async ({
      page,
    }) => {
      const problems = watchConsole(page)
      const response = await page.goto(path)
      expect(response?.status()).toBe(200)
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible()
      await expectHeadingOrder(page, path)
      await expectNoViolations(page, path)
      expect(problems).toEqual([])
    })
  }

  test("the footer links lead to them", async ({ page }) => {
    await page.goto("/")
    const footer = page.getByRole("contentinfo")
    for (const name of [
      "Shipping",
      "Returns and refunds",
      "Questions and answers",
      "About us",
      "Contact",
      "Track your order",
      "Privacy policy",
      "Terms and conditions",
    ]) {
      await footer.getByRole("link", { name, exact: true }).click()
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
      await expect(page.getByText("We could not find that page")).toHaveCount(0)
      await page.goto("/")
    }
  })

  test("the returns page says fabric cut to length cannot be returned", async ({ page }) => {
    await page.goto("/return-refund-policy")
    await expect(text(page, "cannot be returned", { exact: false }).first()).toBeVisible()
  })
})

test.describe("search engines", () => {
  test("this local site asks to be left out, and the sitemap lists real pages only", async ({
    request,
  }) => {
    const robots = await (await request.get("/robots.txt")).text()
    expect(robots).toMatch(/Disallow: \//) // localhost is never public
    const response = await request.get("/sitemap.xml")
    expect(response.status()).toBe(200)
    const xml = await response.text()
    expect(xml).toContain("<loc>http://localhost:3100/products/handloom-cotton</loc>")
    expect(xml).toContain("<loc>http://localhost:3100/shipping-policy</loc>")
    for (const hidden of ["/cart", "/checkout", "/admin", "/account", "/login"])
      expect(xml).not.toContain(`localhost:3100${hidden}`)
  })
})

test.describe("editing the site's own wording", () => {
  test("the owner changes a page, a visitor sees it, and resetting brings the draft back", async ({
    page,
    browser,
  }) => {
    await signInEditor(page)
    await page.goto("/admin/pages")
    await expect(page.locator("#main").getByRole("link", { name: "About us" })).toBeVisible()
    await page.goto("/admin/pages/about")
    const sentence = `We are a family shop in Vadodara, since ${Date.now()}.`
    await label(page, "Text").fill(
      `## Our story\n\n${sentence}\n\n- Cotton\n- Silk\n\nSee [shipping](/shipping-policy).`
    )
    await page.getByRole("button", { name: "Save page" }).click()
    await expect(text(page, "Page saved.")).toBeVisible()

    await label(page, "Text").fill("<script>alert(1)</script> bad")
    await page.getByRole("button", { name: "Save page" }).click()
    await expect(page.getByRole("alert").filter({ hasText: "HTML is not allowed" })).toBeVisible()

    const visitor = await browser.newPage()
    await expect(async () => {
      await visitor.goto("/about")
      await expect(visitor.getByText(sentence)).toBeVisible({ timeout: 1500 })
    }).toPass({ timeout: 20_000 })
    await expect(visitor.getByRole("heading", { level: 2, name: "Our story" })).toBeVisible()
    await expect(visitor.getByRole("listitem").filter({ hasText: "Silk" })).toBeVisible()
    await expect(visitor.locator("#main").getByRole("link", { name: "shipping" })).toHaveAttribute(
      "href",
      "/shipping-policy"
    )

    await page.goto("/admin/pages/about")
    await page.getByRole("button", { name: "Go back to the original wording" }).click()
    await expect(async () => {
      await visitor.goto("/about")
      await expect(visitor.getByText(sentence)).toHaveCount(0)
    }).toPass({ timeout: 20_000 })
    await visitor.close()
  })

  test("the contact form appears once the shop has an email, and says thank you", async ({
    page,
    browser,
  }) => {
    await signInEditor(page)
    await page.goto("/admin/settings")
    await label(page, "Email", { exact: true }).fill("shop-e2e@example.com")
    await label(page, "Phone").fill("+91 98765 43210")
    await page.getByRole("button", { name: "Save settings" }).click()
    await expect(text(page, "Settings saved.")).toBeVisible()

    const visitor = await browser.newPage()
    await expect(async () => {
      await visitor.goto("/contact")
      await expect(visitor.getByRole("form", { name: "Send us a message" })).toBeVisible({
        timeout: 1500,
      })
    }).toPass({ timeout: 20_000 })
    await expect(visitor.getByRole("link", { name: "shop-e2e@example.com" })).toBeVisible()
    await visitor.getByRole("button", { name: "Send message" }).click()
    await expect(visitor.getByRole("alert").filter({ hasText: "Enter your name." })).toBeVisible()
    await label(visitor, "Your name").fill("Asha")
    await label(visitor, "Your email address").fill("asha@example.com")
    await visitor.getByRole("textbox", { name: "Message" }).fill("Do you have the cotton in blue?")
    await visitor.getByRole("button", { name: "Send message" }).click()
    await expect(text(visitor, "Thank you. We will reply within one working day.")).toBeVisible()
    await visitor.close()
  })

  test("a moved shop address redirects, and an unknown one is a real 404", async ({
    page,
    request,
  }) => {
    await signInEditor(page)
    const stamp = Date.now().toString(36)
    await page.goto("/admin/redirects")
    await label(page, "Old address").fill(`/products/old-${stamp}`)
    await label(page, "Send visitors to").fill("/products/handloom-cotton")
    await page.getByRole("button", { name: "Save redirect" }).click()
    await expect(text(page, "Redirect saved.")).toBeVisible()
    await label(page, "Old address").fill("/admin")
    await label(page, "Send visitors to").fill("/")
    await page.getByRole("button", { name: "Save redirect" }).click()
    await expect(page.getByRole("alert").filter({ hasText: "Use a shop address" })).toBeVisible()

    await expect(async () => {
      const moved = await request.get(`/products/old-${stamp}`, { maxRedirects: 0 })
      expect([301, 308]).toContain(moved.status())
      expect(moved.headers().location).toContain("/products/handloom-cotton")
    }).toPass({ timeout: 20_000 })
    expect(
      (await request.get(`/products/never-existed-${stamp}`, { maxRedirects: 0 })).status()
    ).toBe(404)
  })
})
