/**
 * Fast "does this public page exist?" check used by the proxy, so unknown product, category and
 * collection URLs get a real HTTP 404. (With Cache Components the status is committed with the
 * prerendered shell, so a notFound() inside the page would only produce 200 + noindex.)
 *
 * Pure logic with an injected lookup, so it is unit tested without a database. Answers are cached
 * per server instance: hits for `hitTtlMs`, misses for `missTtlMs` (short, so a product an admin has just published is found within seconds; it also caps repeated lookups of
 * random URLs). The cache is bounded. If the lookup throws, the guard fails OPEN: the page renders and
 * handles the miss itself (404 UI plus noindex), so a database outage never turns into a site outage.
 */
export type CatalogKind = "product" | "category" | "collection" | "fabric" | "print"

export type SlugLookup = (kind: CatalogKind, slug: string) => Promise<boolean>

export type GuardOptions = {
  hitTtlMs?: number
  missTtlMs?: number
  maxEntries?: number
  now?: () => number
}

export function createSlugGuard(lookup: SlugLookup, options: GuardOptions = {}) {
  const hitTtl = options.hitTtlMs ?? 60_000
  const missTtl = options.missTtlMs ?? 5_000
  const maxEntries = options.maxEntries ?? 2_000
  const now = options.now ?? Date.now
  const cache = new Map<string, { exists: boolean; expires: number }>()

  return {
    /** true: render the page. false: answer 404. Never throws. */
    async exists(kind: CatalogKind, slug: string): Promise<boolean> {
      const key = `${kind}:${slug}`
      const hit = cache.get(key)
      if (hit && hit.expires > now()) return hit.exists

      try {
        const exists = await lookup(kind, slug)
        cache.delete(key) // re-insert so the oldest entry is always first
        cache.set(key, { exists, expires: now() + (exists ? hitTtl : missTtl) })
        if (cache.size > maxEntries) {
          const oldest = cache.keys().next().value
          if (oldest !== undefined) cache.delete(oldest)
        }
        return exists
      } catch {
        return true
      }
    },
    /** For tests and for dropping stale entries after an admin change. */
    clear: () => cache.clear(),
    get size() {
      return cache.size
    },
  }
}

const CATALOG_PATH = /^\/(products|categories|collections|fabrics|prints)\/([^/]+)\/?$/
const CATEGORY_PATH = /^\/categories\/([^/]+)(?:\/([^/]+))?\/?$/

/** `/categories/fabrics/modal-silk-fabrics` -> { parent: "fabrics", slug: "modal-silk-fabrics" }; one segment -> no parent. */
export function parseCategoryPath(pathname: string): { parent?: string; slug: string } | null {
  const match = CATEGORY_PATH.exec(pathname)
  if (!match) return null
  try {
    const first = decodeURIComponent(match[1] as string)
    if (match[2] === undefined) return { slug: first }
    return { parent: first, slug: decodeURIComponent(match[2]) }
  } catch {
    return null // malformed escape: let the page respond
  }
}

const KINDS = {
  products: "product",
  categories: "category",
  collections: "collection",
  fabrics: "fabric",
  prints: "print",
} as const

/** `/products/handloom-cotton` -> { kind: "product", slug: "handloom-cotton" }. Other paths -> null. */
export function parseCatalogPath(pathname: string): { kind: CatalogKind; slug: string } | null {
  const match = CATALOG_PATH.exec(pathname)
  if (!match) return null
  let slug: string
  try {
    slug = decodeURIComponent(match[2] as string)
  } catch {
    return null // malformed escape: let the page respond
  }
  return { kind: KINDS[match[1] as keyof typeof KINDS], slug }
}
