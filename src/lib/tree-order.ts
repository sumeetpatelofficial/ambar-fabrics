/**
 * The shape of the category menu: a list of top-level categories, each with an ordered list of children.
 * Categories go one level deep, so a category that has children can never itself become a child.
 * Pure functions, used by the dragging screen in the browser and checked again by the server.
 */
export type Layout = { id: string; children: string[] }[]

export const ROOT = "__root__"

const clone = (layout: Layout): Layout =>
  layout.map((l) => ({ id: l.id, children: [...l.children] }))

export function findParent(layout: Layout, id: string): string | typeof ROOT | null {
  if (layout.some((l) => l.id === id)) return ROOT
  return layout.find((l) => l.children.includes(id))?.id ?? null
}

/**
 * Moves one category to a place: `to` is a top-level category's id (become its child) or ROOT (become
 * top-level), and `index` is the position among its new siblings. Returns the new layout, or null when
 * the move is not allowed (into itself, or a parent with children made into a child).
 */
export function moveItem(layout: Layout, id: string, to: string, index: number): Layout | null {
  const from = findParent(layout, id)
  if (from === null || id === to) return null
  const next = clone(layout)
  const entry = next.find((l) => l.id === id)
  if (to !== ROOT) {
    if (!next.some((l) => l.id === to)) return null // can only go under a top-level category
    if (entry && entry.children.length > 0) return null // it has children of its own
  }
  // take it out of where it was
  if (from === ROOT)
    next.splice(
      next.findIndex((l) => l.id === id),
      1
    )
  else {
    const p = next.find((l) => l.id === from)!
    p.children.splice(p.children.indexOf(id), 1)
  }
  // put it where it goes
  if (to === ROOT) {
    next.splice(Math.max(0, Math.min(index, next.length)), 0, entry ?? { id, children: [] })
  } else {
    const p = next.find((l) => l.id === to)!
    p.children.splice(Math.max(0, Math.min(index, p.children.length)), 0, id)
  }
  return next
}

/** Every id in the layout, once each, and exactly the ids that exist. Returns a plain-language problem or null. */
export function layoutProblem(layout: Layout, existing: string[]): string | null {
  const seen = new Set<string>()
  const tops = new Set(layout.map((l) => l.id))
  for (const l of layout) {
    for (const id of [l.id, ...l.children]) {
      if (seen.has(id)) return "A category appears twice in that order."
      seen.add(id)
    }
    for (const child of l.children)
      if (tops.has(child)) return "A category with its own sub-categories cannot go inside another."
  }
  if (seen.size !== existing.length || existing.some((id) => !seen.has(id)))
    return "The categories changed while you were editing. Reload the page and try again."
  return null
}
