import AxeBuilder from "@axe-core/playwright"
import { expect, type Browser, type Locator, type Page } from "@playwright/test"

export const wcag = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]

/**
 * Pages linked from the header and footer that later phases build. Next prefetches links, so until they
 * exist the browser logs a 404 for each. Remove an entry when its page ships; any other 404 still fails.
 */
export const NOT_BUILT_YET: string[] = []

/** Collects console errors and warnings so a React or Base UI warning fails the test. */
export function watchConsole(page: Page) {
  const problems: string[] = []
  page.on("response", (r) => {
    if (r.status() < 400) return
    const { pathname } = new URL(r.url())
    if (NOT_BUILT_YET.includes(pathname)) return
    // A 404 for a page that is meant to 404 (a test visiting an unknown URL) is not a console problem.
    if (r.request().isNavigationRequest()) return
    problems.push(`${r.status()} ${pathname}`)
  })
  page.on("console", (m) => {
    if (/Reduced Motion enabled on your device/.test(m.text())) return // Motion's dev notice: the feature working
    // Resource failures are reported (with their URL) by the response listener above.
    if (/Failed to load resource/.test(m.text())) return
    if (m.type() === "error" || m.type() === "warning") problems.push(m.text().slice(0, 300))
  })
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`))
  return problems
}

export async function expectNoViolations(page: Page, label: string) {
  // Axe must not sample mid-transition (opacity fades read as low contrast).
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        // Looping animations (skeleton pulse) never finish; only wait for one-shot transitions.
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => null))
    )
  )
  // A colour that is still fading in (a button just hovered) is measured half way and can look too pale.
  // Settle every transition first, so the check sees the colours people will actually see.
  await page.addStyleTag({
    content: "*, *::before, *::after { transition: none !important; animation: none !important }",
  })
  await page.mouse.move(0, 0)
  const results = await new AxeBuilder({ page })
    .withTags(wcag)
    // Base UI's focus guards are intentional off-screen tab stops used to trap focus in popups.
    .exclude("[data-base-ui-focus-guard]")
    .analyze()
  const summary = results.violations.map(
    (v) =>
      `${v.id}: ${v.nodes
        .map(
          (n) =>
            `${n.target.join(" ")} [${(n.failureSummary ?? "").replace(/\s+/g, " ").slice(0, 160)}]`
        )
        .slice(0, 3)
        .join(" | ")}`
  )
  expect(summary, `axe violations (${label})`).toEqual([])
}

/** Parsed JSON-LD blocks from the current page. */
export async function jsonLd(page: Page): Promise<Record<string, unknown>[]> {
  const raw = await page.locator('script[type="application/ld+json"]').allTextContents()
  return raw.map((t) => JSON.parse(t) as Record<string, unknown>)
}

/** Heading levels in document order must never jump down by more than one (h1 to h3 is a skip). */
export async function expectHeadingOrder(page: Page, label: string) {
  const levels = await page.evaluate(() =>
    [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")]
      .filter((h) => !h.closest("[hidden], [aria-hidden='true']"))
      .map((h) => Number(h.tagName[1]))
  )
  expect(levels[0], `${label}: first heading`).toBe(1)
  expect(
    levels.filter((l) => l === 1),
    `${label}: exactly one h1`
  ).toHaveLength(1)
  levels.forEach((level, i) => {
    if (i > 0)
      expect(
        level,
        `${label}: heading #${i + 1} (h${level}) follows h${levels[i - 1]}`
      ).toBeLessThanOrEqual((levels[i - 1] ?? 1) + 1)
  })
}

import { test as base, type APIRequestContext } from "@playwright/test"

/**
 * Each test gets its own client address (`x-forwarded-for`), so the sign-in rate limits, which are per
 * address, do not make unrelated tests interfere with each other. The rate-limit test sets its own.
 */
let counter = 0
export type ConsentSetting = "denied" | "granted" | "unset"
/** The id the test server is built with: it makes the cookie banner exist. */
export const E2E_GA_ID = "G-E2ETEST01"

export const test = base.extend<{ consent: ConsentSetting }>({
  /**
   * What the visitor has already chosen about analytics cookies. Most tests start as "denied" so the banner
   * stays out of their way; the analytics tests choose "unset" (a new visitor) or "granted".
   */
  consent: ["denied", { option: true }],
  // Google is never contacted: its address is answered with an empty script, and each request is counted.
  context: async ({ context, consent }, provide) => {
    await context.route("**://www.googletagmanager.com/**", (route) =>
      route.fulfill({ status: 200, contentType: "application/javascript", body: "/* test */" })
    )
    if (consent !== "unset")
      await context.addInitScript((choice) => {
        try {
          if (!window.localStorage.getItem("af-consent"))
            window.localStorage.setItem(
              "af-consent",
              JSON.stringify({ choice, at: Date.now(), version: 1 })
            )
        } catch {
          /* storage blocked */
        }
      }, consent)
    await provide(context)
  },
  // After each navigation, wait for React's streamed sections to finish swapping in. Until then the server's
  // copy sits in a hidden container next to the live one, and a query can briefly match both.
  page: async ({ page }, provide) => {
    const goto = page.goto.bind(page)
    page.goto = async (...args: Parameters<typeof goto>) => {
      const response = await goto(...args)
      await page
        .waitForFunction(() => !document.querySelector('div[hidden][id^="S:"]'), undefined, {
          timeout: 5000,
        })
        .catch(() => undefined)
      return response
    }
    await provide(page)
  },
  extraHTTPHeaders: async ({}, provide, testInfo) => {
    const n = (testInfo.workerIndex + 1) * 10_000 + ++counter
    await provide({ "x-forwarded-for": `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}` })
  },
})
/** A second browser for the same test, with its own client address so the per-address sign-in limits do not collide. */
export function otherDevice(browser: Browser) {
  const n = Math.floor(Math.random() * 0xfffff) + 0x100000
  return browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}` },
  })
}

export { expect } from "@playwright/test"

/** Chooses an entry in the shop's drop-down list (the shadcn Select): open it, then click the entry by name. */
export async function choose(page: Page, trigger: Locator, option: string) {
  await trigger.click()
  await page.getByRole("option", { name: option, exact: true }).click()
}

export type TestUser = { name: string; email: string; password: string }

let userCounter = 0
/** A fresh, unique customer identity. Passwords avoid the name and email so the password rules accept them. */
export function newUser(label = "Customer"): TestUser {
  const id = `${Date.now().toString(36)}${(++userCounter).toString(36)}${Math.random().toString(36).slice(2, 6)}`
  return {
    name: `${label} Tester`,
    email: `u${id}@example.com`,
    password: "plain-test-phrase-with-words-91",
  }
}

/** The newest link of a kind sent to an address, read from the test-only mailbox. */
export async function emailLink(
  request: APIRequestContext,
  to: string,
  template: "verify_email" | "password_reset"
): Promise<string> {
  const response = await request.get(
    `/api/dev/mailbox?to=${encodeURIComponent(to)}&template=${template}`
  )
  expect(response.ok()).toBe(true)
  const { data } = (await response.json()) as { data: { text?: string }[] }
  const match = /(https?:\/\/\S+)/.exec(data[0]?.text ?? "")
  if (!match?.[1]) throw new Error(`no ${template} email for ${to}`)
  const url = new URL(match[1])
  return `${url.pathname}${url.search}`
}

export async function emailCount(
  request: APIRequestContext,
  to: string,
  template: string
): Promise<number> {
  const { data } = (await (
    await request.get(`/api/dev/mailbox?to=${encodeURIComponent(to)}&template=${template}`)
  ).json()) as { data: unknown[] }
  return data.length
}

/**
 * Form fields by label, visible ones only. While a streamed section is being swapped in, React keeps a
 * hidden server-rendered copy for a moment; people never see it, but a plain label query would match both.
 */
export const label = (page: Page, text: string | RegExp, options?: { exact?: boolean }) =>
  page.getByLabel(text, options).filter({ visible: true })

/** Messages from forms. Next's own route announcer is also role="alert", so it is excluded. */
export const alerts = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)')

/** Text on the page, visible matches only (see `label`). */
export const text = (page: Page, value: string | RegExp, options?: { exact?: boolean }) =>
  page.getByText(value, options).filter({ visible: true })

/** Product names in a listing, visible ones only, in page order. */
export const cardTitles = (page: Page) =>
  page.locator("article :is(h2, h3)").filter({ visible: true })

/** Cumulative layout shift of the current page over a few seconds, measured with the browser's own entries. */
export async function measureLayoutShift(
  page: Page,
  path: string,
  settleMs = 2500
): Promise<number> {
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number }
    w.__cls = 0
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as {
        hadRecentInput: boolean
        value: number
      }[]) {
        if (!entry.hadRecentInput) w.__cls += entry.value
      }
    }).observe({ type: "layout-shift", buffered: true })
  })
  await page.goto(path)
  await page.waitForTimeout(settleMs)
  return page.evaluate(() => (window as unknown as { __cls: number }).__cls)
}
