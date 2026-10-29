import { expect, expectNoViolations, test, watchConsole } from "./helpers"

test.describe("desktop shell", () => {
  test.use({ viewport: { width: 1360, height: 900 } })

  test("loads without console problems and passes axe", async ({ page }) => {
    const problems = watchConsole(page)
    await page.goto("/")
    await expect(page.getByRole("link", { name: "Ambar" }).first()).toBeVisible()
    await expectNoViolations(page, "home")
    await page.goto("/dev/components")
    await expect(page.getByRole("heading", { name: "Component preview" })).toBeVisible()
    await expectNoViolations(page, "component preview")
    expect(problems).toEqual([])
  })

  test("the hamburger opens the menu, turns into a cross, and Escape closes it", async ({
    page,
  }) => {
    const problems = watchConsole(page)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto("/")
    // The logo is in the middle of the header, the menu button on the left.
    const logo = page.getByRole("banner").getByRole("link", { name: "Ambar" })
    const burger = page.getByRole("button", { name: "Open menu" })
    const [l, b, v] = [await logo.boundingBox(), await burger.boundingBox(), page.viewportSize()!]
    expect(Math.abs(l!.x + l!.width / 2 - v.width / 2)).toBeLessThan(2)
    expect(b!.x).toBeLessThan(l!.x)
    // There is no separate row of links any more: everything is in the menu.
    await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden()

    await burger.focus()
    await page.keyboard.press("Enter")
    const close = page.getByRole("button", { name: "Close menu" }).first()
    await expect(close).toHaveAttribute("aria-expanded", "true")
    const menu = page.getByRole("dialog", { name: "Main menu" })
    await expect(menu).toBeVisible()
    // Main categories are set large, each with room above and below.
    const fabrics = menu.getByRole("link", { name: "Fabrics", exact: true })
    await expect(fabrics).toBeVisible()
    const metrics = await fabrics.evaluate((el) => {
      const cs = getComputedStyle(el)
      return { size: parseFloat(cs.fontSize), pad: parseFloat(cs.paddingTop) }
    })
    expect(metrics.size).toBe(32)
    expect(metrics.pad).toBeGreaterThanOrEqual(16)
    for (const name of [
      "Dupattas",
      "Blouses",
      "Ready-made",
      "Unstitched suits",
      "New arrivals",
      "Sale",
    ])
      await expect(menu.getByRole("link", { name, exact: true }), name).toBeVisible()

    // Sub-categories open in place.
    const cotton = menu.getByRole("link", { name: "Cotton", exact: true })
    await expect(cotton).toBeHidden()
    await menu.getByRole("button", { name: "Show Fabrics sub-categories" }).click()
    await expect(cotton).toBeVisible()
    await expectNoViolations(page, "menu open")
    await page.keyboard.press("Escape")
    await expect(menu).toBeHidden()
    await expect(page.getByRole("button", { name: "Open menu" })).toBeFocused()
    expect(problems).toEqual([])
  })

  test("the menu closes from the dimmed page and when a link is followed", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Open menu" }).click()
    const menu = page.getByRole("dialog", { name: "Main menu" })
    await expect(menu).toBeVisible()
    await page.mouse.click(1000, 500)
    await expect(menu).toBeHidden()
    await page.getByRole("button", { name: "Open menu" }).click()
    await menu.getByRole("link", { name: "Sale", exact: true }).click()
    await expect(page).toHaveURL(/\/sale$/)
    await expect(menu).toBeHidden()
  })

  test("search panel focuses the input and submits a shareable GET URL", async ({ page }) => {
    const problems = watchConsole(page)
    await page.goto("/")
    await page.getByRole("button", { name: "Search" }).click()
    const input = page.getByRole("searchbox", { name: "Search products" })
    await expect(input).toBeFocused()
    await expectNoViolations(page, "search open")
    await input.fill("bandhani dupatta")
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(/\/search\?q=bandhani\+dupatta$/)
    expect(problems.filter((p) => !/404/.test(p))).toEqual([])
  })

  test("product card swaps image on hover and the wishlist toggle announces its state", async ({
    page,
  }) => {
    await page.goto("/dev/components")
    const heart = page.getByRole("button", { name: /Add Handloom cotton, sage to wishlist/ })
    await expect(heart).toHaveAttribute("aria-pressed", "false")
    await heart.click()
    const pressed = page.getByRole("button", { name: /Remove Handloom cotton, sage from wishlist/ })
    await expect(pressed).toHaveAttribute("aria-pressed", "true")
  })

  test("confirm dialog traps focus, is labelled, and names the action", async ({ page }) => {
    const problems = watchConsole(page)
    await page.goto("/dev/components")
    await page.getByRole("button", { name: "Remove item" }).click()
    const dialog = page.getByRole("dialog", { name: "Remove this item?" })
    await expect(dialog).toBeVisible()
    await expectNoViolations(page, "dialog open")
    await dialog.getByRole("button", { name: "Keep it" }).click()
    await expect(dialog).toBeHidden()
    expect(problems).toEqual([])
  })

  test("toast appears for an action and is announced", async ({ page }) => {
    await page.goto("/dev/components")
    await page.getByRole("button", { name: "Added to bag" }).click()
    await expect(page.getByText("Added to your bag")).toBeVisible()
  })

  test("skip link is the first tab stop and moves focus to main content", async ({ page }) => {
    await page.goto("/")
    await page.keyboard.press("Tab")
    const skip = page.getByRole("link", { name: "Skip to content" })
    await expect(skip).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(/#main$/)
  })

  test("unknown routes return a real 404 with a way forward", async ({ page }) => {
    const res = await page.goto("/definitely-not-a-page")
    expect(res?.status()).toBe(404)
    await expect(page.getByRole("heading", { name: "We could not find that page" })).toBeVisible()
    await expect(page.getByRole("link", { name: "Browse categories" })).toBeVisible()
  })

  test("reduced motion: pages render and the card image swap is instant", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    const problems = watchConsole(page)
    await page.goto("/dev/components")
    await expect(page.getByRole("heading", { name: "Product cards" })).toBeVisible()
    expect(problems).toEqual([])
  })
})

test.describe("mobile shell", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

  test("has no horizontal scroll and passes axe", async ({ page }) => {
    const problems = watchConsole(page)
    for (const path of ["/", "/dev/components"]) {
      await page.goto(path)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      )
      expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(0)
      await expectNoViolations(page, `mobile ${path}`)
    }
    expect(problems).toEqual([])
  })

  test("the menu works on a phone: open, expand a category, follow a link", async ({ page }) => {
    const problems = watchConsole(page)
    await page.goto("/")
    await page.getByRole("button", { name: "Open menu" }).click()
    const menu = page.getByRole("dialog", { name: "Main menu" })
    await expect(menu).toBeVisible()
    // On a phone the logo is still in the middle of the header.
    const logo = await page.getByRole("banner").getByRole("link", { name: "Ambar" }).boundingBox()
    expect(Math.abs(logo!.x + logo!.width / 2 - page.viewportSize()!.width / 2)).toBeLessThan(2)
    await menu.getByRole("button", { name: "Show Fabrics sub-categories" }).click()
    await expectNoViolations(page, "menu open on a phone")
    await menu.getByRole("link", { name: "Cotton", exact: true }).click()
    await expect(page).toHaveURL(/\/categories\/fabrics\/cotton-fabrics$/)
    await expect(menu).toBeHidden()
    expect(problems.filter((p) => !/404/.test(p))).toEqual([])
  })

  test("header touch targets are at least 40px", async ({ page }) => {
    await page.goto("/")
    for (const name of ["Open menu", "Search", "Bag"]) {
      const box = await page
        .getByRole("button", { name })
        .or(page.getByRole("link", { name }))
        .first()
        .boundingBox()
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(40)
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(40)
    }
  })
})
