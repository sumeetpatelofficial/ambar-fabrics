import type { Page } from "@playwright/test"
import { E2E_COUPONS, E2E_THEME } from "./accounts"
import { expect, expectNoViolations, label, test, watchConsole } from "./helpers"

// The offer test changes which coupon is on the home page, so this file's tests run one after another.
test.describe.configure({ mode: "serial" })

const triggers = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __scrollTriggerCount?: number }).__scrollTriggerCount ?? -1
  )

/** Scrolls so that the bottom of a section is at the bottom of the screen (the end of a pinned stage). */
async function scrollToEndOf(page: Page, selector: string) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel)!
    window.scrollTo(0, el.getBoundingClientRect().bottom + window.scrollY - window.innerHeight)
  }, selector)
  await page.waitForTimeout(900)
}

test.describe("home page sections", () => {
  test("has every section, one h1, real new arrivals, no placeholder text, and passes axe", async ({
    page,
  }) => {
    const problems = watchConsole(page)
    await page.goto("/")
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1)
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Draped in")
    const labels = await page
      .locator("main section[aria-label], main section[aria-labelledby]")
      .evaluateAll((els) =>
        els.map(
          (e) =>
            e.getAttribute("aria-label") ??
            document.getElementById(e.getAttribute("aria-labelledby")!)?.textContent
        )
      )
    expect(labels).toEqual([
      "Featured collections",
      "The wardrobe",
      "Shop by category",
      "Every angle",
      "Lookbook",
      "Cut to order",
      "New arrivals",
      "Festive offer",
      "Customer reviews",
      "Get in touch",
    ])
    expect(await page.locator("body").innerText()).not.toMatch(/\[[A-Z ]{3,}\]/)

    // Checked at the top of the page: scrolled away, the hero fades out, which axe would count as low contrast.
    await expectNoViolations(page, "home")

    // New arrivals come from the catalogue: real products, linked to their pages.
    const arrivals = page.getByRole("region", { name: "New arrivals" })
    await expect(arrivals.locator("article")).toHaveCount(4)
    await arrivals.scrollIntoViewIfNeeded()
    await expect(arrivals.locator("a[href^='/products/']").first()).toBeVisible()
    expect(problems).toEqual([])
  })

  test("is readable and passes axe on a phone, without sideways scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    )
    expect(overflow).toBeLessThanOrEqual(0)
    await expectNoViolations(page, "home on a phone")
  })

  test("the hero changes slide from its bars, pauses, and moves on by itself", async ({ page }) => {
    test.slow()
    await page.goto("/")
    await page.getByRole("button", { name: "Show Everyday cotton" }).click()
    await expect(page.getByRole("heading", { name: /Soft on/ })).toBeVisible()
    await expect(page.getByRole("button", { name: "Show Everyday cotton" })).toHaveAttribute(
      "aria-current",
      "true"
    )
    const pause = page.getByRole("button", { name: "Pause slides" })
    await pause.click()
    await expect(page.getByRole("button", { name: "Play slides" })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await page.getByRole("button", { name: "Play slides" }).click()
    // Six seconds later it moves to the third slide without being asked.
    await expect(page.getByRole("button", { name: "Show Wedding dupattas" })).toHaveAttribute(
      "aria-current",
      "true",
      { timeout: 12_000 }
    )
  })

  test("scrolling changes the wardrobe outfit, unrolls the fabric and prices it", async ({
    page,
  }) => {
    await page.goto("/")
    await scrollToEndOf(page, '[aria-label="The wardrobe"]')
    await expect(
      page.getByRole("heading", { level: 3, name: "Tissue kurti and dupatta" })
    ).toBeVisible()
    await scrollToEndOf(page, '[aria-label="Cut to order"]')
    // Three metres of block print cotton at Rs 220 a metre.
    await expect(page.getByText("3 m", { exact: true }).first()).toBeVisible()
    await expect(page.getByText("₹660", { exact: true })).toBeVisible()
    await expect(page.locator('[aria-label="Cut to order"] [role="status"]')).toContainText(
      "3 m, ₹660"
    )
  })

  test("moves through the category rail to the last card", async ({ page }) => {
    await page.goto("/")
    await scrollToEndOf(page, '[aria-label="Shop by category"]')
    await expect(
      page.getByRole("link", { name: "All categories", exact: true }).first()
    ).toBeInViewport()
    const hrefs = await page
      .getByRole("region", { name: "Shop by category" })
      .locator("a")
      .evaluateAll((a) => a.map((x) => x.getAttribute("href")))
    expect(hrefs).toContain("/categories/fabrics/lace-and-borders")
    expect(hrefs).toContain("/categories/dupattas")
  })
})

test.describe("the hero backdrop", () => {
  const tintOf = (page: Page) =>
    page.evaluate(() => {
      const layers = [...document.querySelectorAll("[data-tint]")] as HTMLElement[]
      const i = layers.findIndex((l) => Number(getComputedStyle(l).opacity) > 0.99)
      return i < 0 ? null : { index: i, color: getComputedStyle(layers[i]!).backgroundColor }
    })

  test("the background colour, the big word and the swatches follow the slide", async ({
    page,
  }) => {
    await page.goto("/")
    expect(await tintOf(page)).toEqual({ index: 0, color: "rgb(243, 230, 220)" })
    const word = (i: number) =>
      page.locator("[data-slide]").nth(i).locator("[data-ghost]").getAttribute("data-text")
    expect([await word(0), await word(1), await word(2)]).toEqual(["Utsav", "Roz", "Shaadi"])

    await page.getByRole("button", { name: "Show Everyday cotton" }).click()
    await expect.poll(() => tintOf(page)).toEqual({ index: 1, color: "rgb(236, 239, 230)" })
    await page.getByRole("button", { name: "Show Wedding dupattas" }).click()
    await expect.poll(() => tintOf(page)).toEqual({ index: 2, color: "rgb(243, 235, 214)" })

    // Three swatches per slide, the mandala and both outlines, all hidden from assistive technology.
    const slide = page.locator("[data-slide]").nth(2)
    await expect(slide.locator("[data-swatch]")).toHaveCount(3)
    await expect(slide.locator(".mandala")).toHaveCount(1)
    expect(await slide.locator("[data-swatch]").first().isVisible()).toBe(true)
    expect(
      await page
        .locator("[data-tint]")
        .first()
        .evaluate((el) => el.closest("[aria-hidden='true']") !== null)
    ).toBe(true)
  })

  test("the swatches follow the mouse, and the big word goes the other way", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto("/")
    const move = (sel: string) =>
      page
        .locator("[data-slide]")
        .first()
        .locator(sel)
        .first()
        .evaluate((el) => {
          const m = new DOMMatrix(getComputedStyle(el).transform)
          return { x: Math.round(m.m41), y: Math.round(m.m42) }
        })
    expect(await move("[data-swatch]")).toEqual({ x: 0, y: 0 })
    await page.mouse.move(1300, 500)
    await expect
      .poll(async () => (await move("[data-swatch]")).x, { timeout: 5000 })
      .toBeGreaterThan(5)
    // Moving right pushes the swatches right and the big word left.
    const ghost = await move("[data-depth='-0.7']")
    expect(ghost.x).toBeLessThan(0)
    // Leaving the hero lets everything settle back.
    await page.mouse.move(700, 880)
    await page.mouse.move(700, 960)
    await expect
      .poll(async () => Math.abs((await move("[data-swatch]")).x), { timeout: 5000 })
      .toBeLessThan(40)
  })

  test("phones get no swatches", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/")
    await expect(page.locator("[data-slide]").first().locator("[data-swatch]").first()).toBeHidden()
  })

  test("with reduced motion the mandala does not turn, the swatches do not bob and the mouse moves nothing", async ({
    browser,
  }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" })
    const page = await context.newPage()
    await page.goto("http://localhost:3100/")
    const names = await page
      .locator("[data-slide]")
      .first()
      .evaluate((s) => ({
        mandala: getComputedStyle(s.querySelector(".mandala")!, "::before").animationName,
        bob: getComputedStyle(s.querySelector(".swatch-bob")!).animationName,
      }))
    expect(names).toEqual({ mandala: "none", bob: "none" })
    await page.mouse.move(1300, 500)
    await page.waitForTimeout(900)
    const x = await page
      .locator("[data-slide]")
      .first()
      .locator("[data-swatch]")
      .first()
      .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41)
    expect(x).toBe(0)
    await context.close()
  })

  test("is still accessible on every slide", async ({ page }) => {
    await page.goto("/")
    await expectNoViolations(page, "hero slide 1")
    await page.getByRole("button", { name: "Show Wedding dupattas" }).click()
    await page.waitForTimeout(1800)
    await expectNoViolations(page, "hero slide 3")
  })
})

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" })

  test("nothing is pinned or animated, and every part still reads and works", async ({ page }) => {
    await page.goto("/")
    await page.waitForTimeout(800)
    expect(await triggers(page)).toBe(0)
    // The hero stays on its first slide and has no moving bars or pause button.
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Draped in")
    await expect(page.getByRole("button", { name: "Pause slides" })).toBeHidden()
    // The wardrobe list picks the outfit instead of the scroll.
    await page.getByRole("button", { name: "Show look 3: Block-print co-ord" }).click()
    await expect(page.getByRole("heading", { level: 3, name: "Block-print co-ord" })).toBeVisible()
    // Cut to order shows a fixed example.
    await expect(page.getByText("2.5 m", { exact: true }).first()).toBeVisible()
    await expect(page.getByText("₹550", { exact: true })).toBeVisible()
    // The category row scrolls by hand.
    const rail = page.locator(".rail-stage")
    expect(await rail.evaluate((el) => getComputedStyle(el).overflowX)).toBe("auto")
    await expectNoViolations(page, "home with reduced motion")
  })
})

test.describe("when it moves", () => {
  test("leaving the page and coming back leaves no scroll triggers behind", async ({ page }) => {
    await page.goto("/")
    await page.evaluate(() => window.scrollTo(0, 3000))
    await page.waitForTimeout(500)
    const first = await triggers(page)
    expect(first).toBeGreaterThan(5)
    for (let i = 0; i < 3; i++) {
      await page.getByRole("contentinfo").getByRole("link", { name: "Sale" }).click()
      await expect(page).toHaveURL(/\/sale$/)
      await page.goBack()
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Draped in")
      await page.waitForTimeout(500)
    }
    await page.evaluate(() => window.scrollTo(0, 3000))
    await page.waitForTimeout(500)
    // Every trigger was made again, none was left over.
    expect(await triggers(page)).toBeLessThanOrEqual(first + 2)
    await page.getByRole("contentinfo").getByRole("link", { name: "Sale" }).click()
    await expect(page).toHaveURL(/\/sale$/)
    await page.waitForTimeout(400)
    expect(await triggers(page)).toBeLessThanOrEqual(2) // only the footer's own, if it is near
  })

  test("the page does not jump while it loads and while it is scrolled from top to bottom", async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await page.addInitScript(() => {
      ;(window as unknown as { __cls: number }).__cls = 0
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as {
          value: number
          hadRecentInput: boolean
        }[])
          if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value
      }).observe({ type: "layout-shift", buffered: true })
    })
    await page.goto("/")
    await page.waitForTimeout(1200)
    const total = await page.evaluate(() => document.documentElement.scrollHeight)
    // Wheel scrolling in steps, as a visitor would, through every pinned stage.
    await page.mouse.move(700, 450)
    for (let y = 0; y < total; y += 100) {
      await page.mouse.wheel(0, 100)
      await page.waitForTimeout(25)
    }
    const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls)
    expect(cls).toBeLessThan(0.1)
  })
})

test.describe("the sign-up form", () => {
  test("asks for a real address, then says thank you", async ({ page }) => {
    await page.goto("/")
    const email = page.getByLabel("Get new arrivals and offers first")
    await email.scrollIntoViewIfNeeded()
    await email.fill("not an address")
    await page.getByRole("button", { name: "Subscribe" }).click()
    await expect(
      page.getByRole("alert").filter({ hasText: "Enter an email address" })
    ).toBeVisible()
    await email.fill("meera@example.com")
    await page.getByRole("button", { name: "Subscribe" }).click()
    await expect(page.getByRole("status").filter({ hasText: "Thank you" })).toBeVisible()
  })
})

test.describe("the theme", () => {
  test("the shop uses the new colours and fonts, the staff area keeps the old ones", async ({
    page,
  }) => {
    await page.goto("/")
    const read = () =>
      page.evaluate(() => {
        const css = getComputedStyle(document.documentElement)
        return {
          primary: css.getPropertyValue("--primary").trim().toLowerCase(),
          background: css.getPropertyValue("--background").trim().toLowerCase(),
          display: getComputedStyle(document.querySelector("h1, h2")!).fontFamily,
        }
      })
    const shop = await read()
    expect(shop.primary).toBe("#1c2b27")
    expect(shop.background).toBe("#f5efe4")
    expect(shop.display).toMatch(/instrument/i)

    await page.goto("/login")
    await label(page, "Email address").fill(E2E_THEME.email)
    await label(page, "Password", { exact: true }).fill(E2E_THEME.password)
    await page.getByRole("button", { name: "Sign in", exact: true }).click()
    await expect(page).toHaveURL((u) => !u.pathname.startsWith("/login"))
    await page.goto("/admin")
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible()
    const admin = await read()
    expect(admin.primary).toBe("#06332e")
    expect(admin.background).toBe("#fbf9f4")
    expect(admin.display).toMatch(/gilda/i)
    // And back in the shop it is the new theme again.
    await page.goto("/shop")
    expect((await read()).primary).toBe("#1c2b27")
  })
})

test.describe("the festive offer and the reviews", () => {
  test("the offer shows the real coupon, and its code can be copied", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"])
    await page.goto("/")
    const offer = page.getByRole("region", { name: "Festive offer" })
    await offer.scrollIntoViewIfNeeded()
    await expect(offer.getByText("15", { exact: false }).first()).toBeVisible()
    await expect(offer).toContainText("FESTIVE15")
    await expect(offer).toContainText("on orders above ₹1,500")
    await expect(offer).toContainText(/Valid until \d{1,2} [A-Z][a-z]+/)
    await offer.getByRole("button", { name: "Copy code" }).click()
    await expect(offer.getByRole("button", { name: "Copied" })).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("FESTIVE15")
    await expect(offer.getByRole("link", { name: "Shop the offer" })).toHaveAttribute(
      "href",
      "/shop"
    )
  })

  test("reviews are real ones, with a short name, stars and a link to the product", async ({
    page,
  }) => {
    await page.goto("/")
    const reviews = page.getByRole("region", { name: "Customer reviews" })
    await reviews.scrollIntoViewIfNeeded()
    const cards = reviews.locator("figure")
    expect(await cards.count()).toBeGreaterThanOrEqual(4)
    const text = await reviews.innerText()
    expect(text).toMatch(/Meera S\./)
    expect(text).not.toMatch(/Shah|@sample|sample\.invalid/) // never a full name or an email
    await expect(cards.first().getByRole("img", { name: /out of 5/ })).toBeVisible()
    const link = cards.first().getByRole("link").first()
    expect(await link.getAttribute("href")).toMatch(/^\/products\/[a-z0-9-]+#reviews$/)
  })

  test("both sections read well on a phone and with reduced motion", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.goto("/")
    const offer = page.getByRole("region", { name: "Festive offer" })
    await offer.scrollIntoViewIfNeeded()
    await expect(offer).toContainText("FESTIVE15")
    await page.getByRole("region", { name: "Customer reviews" }).scrollIntoViewIfNeeded()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    ).toBeLessThanOrEqual(0)
    await expectNoViolations(page, "offer and reviews on a phone")
  })

  test("an admin ticks 'Show on the home page' on a coupon and the band follows it", async ({
    page,
  }) => {
    const stamp = Date.now().toString(36).toUpperCase()
    const code = `HOME${stamp}`.slice(0, 20)
    await page.goto("/login")
    await label(page, "Email address").fill(E2E_COUPONS.email)
    await label(page, "Password", { exact: true }).fill(E2E_COUPONS.password)
    await page.getByRole("button", { name: "Sign in", exact: true }).click()
    await expect(page).toHaveURL((u) => !u.pathname.startsWith("/login"))

    await page.goto("/admin/coupons/new")
    await label(page, "Code").fill(code)
    await label(page, "Percentage", { exact: true }).fill("25")
    await page.getByRole("checkbox", { name: "Show on the home page" }).check()
    await page.getByRole("button", { name: "Save coupon" }).click()
    await expect(page).toHaveURL(/\/admin\/coupons\?saved=1$/)
    await expect(page.getByText(`${code}`).first()).toBeVisible()
    await expect(page.getByText(/on the home page/).first()).toBeVisible()

    await page.goto("/")
    const offer = page.getByRole("region", { name: "Festive offer" })
    await expect(offer).toContainText(code)
    await expect(offer).toContainText("25")
    // It took the place of the sample coupon: only one is shown.
    await expect(offer).not.toContainText("FESTIVE15")

    // Unticking removes the band.
    await page.goto("/admin/coupons")
    await page.getByRole("link", { name: code }).click()
    await page.getByRole("checkbox", { name: "Show on the home page" }).uncheck()
    await page.getByRole("button", { name: "Save coupon" }).click()
    await expect(page).toHaveURL(/\/admin\/coupons\?saved=1$/)
    await page.goto("/")
    await expect(page.getByRole("region", { name: "Festive offer" })).toHaveCount(0)

    // Put the sample offer back, so the other tests (and a retry) find it as before.
    await page.goto("/admin/coupons")
    await page.getByRole("link", { name: "FESTIVE15" }).click()
    await page.getByRole("checkbox", { name: "Show on the home page" }).check()
    await page.getByRole("button", { name: "Save coupon" }).click()
    await expect(page).toHaveURL(/\/admin\/coupons\?saved=1$/)
    await page.goto("/")
    await expect(page.getByRole("region", { name: "Festive offer" })).toContainText("FESTIVE15")
  })
})
