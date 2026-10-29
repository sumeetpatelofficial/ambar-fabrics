import { expect, test } from "./helpers"

test("cards in a row are the same height and their prices line up, whatever the title length", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto("/shop")
  const cards = page.locator("article").filter({ visible: true })
  const data = await cards.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect()
      const title = el.querySelector("h2 a, h3 a") as HTMLElement
      const first = [...el.querySelectorAll("*")].find(
        (n) => /^₹/.test(n.textContent?.trim() ?? "") && n.children.length === 0
      ) as HTMLElement | undefined
      return {
        top: Math.round(r.top),
        h: Math.round(r.height),
        price: first ? Math.round(first.getBoundingClientRect().top - r.top) : -1,
        lines: Math.round(title.getBoundingClientRect().height),
      }
    })
  )
  const rows = new Map<number, typeof data>()
  for (const d of data) rows.set(d.top, [...(rows.get(d.top) ?? []), d])
  for (const [, row] of rows) {
    if (row.length < 2) continue
    expect(new Set(row.map((c) => c.h)).size, JSON.stringify(row)).toBe(1)
    expect(new Set(row.map((c) => c.price)).size, JSON.stringify(row)).toBe(1)
  }
  // At least one row mixes one-line and two-line titles, which is what this guards.
  expect(data.some((d) => d.lines >= 40)).toBe(true)
})
