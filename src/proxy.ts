import { NextResponse, type NextRequest } from "next/server"
import { categoryHref } from "@/lib/category-url"
import { createSlugGuard, parseCatalogPath, parseCategoryPath } from "@/lib/slug-guard"
import { redirectRepository } from "@/repositories/redirect-repository"
import { slugRepository } from "@/repositories/slug-repository"

/**
 * Runs before rendering. Two jobs, both cheap:
 *
 * 1. Unknown product, category and collection URLs are rewritten to a page that answers a real 404
 *    (see docs/seo-strategy.md §10).
 * 2. Private areas (/account, /admin) are sent to sign in when there is no session cookie at all. This is
 *    only a convenience that avoids rendering for strangers: it does not verify the session. The real
 *    checks are in each page and service (requireUser, assertPermission), which always re-read the account.
 */
const guard = createSlugGuard((kind, slug) => slugRepository.exists(kind, slug))

/** Where each category lives (top level or under a parent), remembered briefly so a page view costs no extra lookup. */
const parents = new Map<string, { parent: string | null | undefined; expires: number }>()
async function parentOf(slug: string): Promise<string | null | undefined> {
  const hit = parents.get(slug)
  if (hit && hit.expires > Date.now()) return hit.parent
  const parent = await slugRepository.categoryParent(slug)
  parents.delete(slug)
  parents.set(slug, { parent, expires: Date.now() + (parent === undefined ? 5_000 : 60_000) })
  if (parents.size > 2_000) parents.delete(parents.keys().next().value as string)
  return parent
}

const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"]

function hasSessionCookie(request: NextRequest): boolean {
  // Large sessions are split into numbered chunks, such as "authjs.session-token.0".
  return request.cookies
    .getAll()
    .some((c) => SESSION_COOKIES.some((name) => c.name === name || c.name.startsWith(`${name}.`)))
}

/** Guests can keep a wishlist, so that one account page is public. */
const PUBLIC_ACCOUNT_PATHS = new Set(["/account/wishlist"])

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  if (pathname.startsWith("/account") || pathname.startsWith("/admin")) {
    if (PUBLIC_ACCOUNT_PATHS.has(pathname) || hasSessionCookie(request)) return NextResponse.next()
    const login = new URL("/login", request.url)
    login.searchParams.set("next", `${pathname}${search}`)
    return NextResponse.redirect(login)
  }

  if (pathname.startsWith("/categories/")) {
    const category = parseCategoryPath(pathname)
    if (category) {
      try {
        const parent = await parentOf(category.slug)
        if (parent !== undefined) {
          // The address must say where the category really is: sub-categories live under their parent,
          // and the older single-segment address of one moves there permanently.
          const right = parent ?? undefined
          if (category.parent !== right) {
            const home = new URL(categoryHref(category.slug, right), request.url)
            home.search = search
            return NextResponse.redirect(home, 308)
          }
          return NextResponse.next()
        }
      } catch {
        return NextResponse.next() // lookup failed: the page itself handles it
      }
      // Not a visible category: it may have moved (Admin, Redirects), otherwise a real 404.
      try {
        const moved = await redirectRepository.find(pathname)
        if (moved)
          return NextResponse.redirect(new URL(moved.toPath, request.url), moved.statusCode)
      } catch {
        // fall through to the 404
      }
      return NextResponse.rewrite(new URL("/not-found-page", request.url), { status: 404 })
    }
  }

  const target = parseCatalogPath(pathname)
  if (!target) return NextResponse.next()
  if (await guard.exists(target.kind, target.slug)) return NextResponse.next()
  // A page that no longer exists may have moved: the owner can record where it went (Admin, Redirects).
  try {
    const moved = await redirectRepository.find(pathname)
    if (moved) return NextResponse.redirect(new URL(moved.toPath, request.url), moved.statusCode)
  } catch {
    // If the lookup fails the visitor simply gets the 404 below.
  }
  return NextResponse.rewrite(new URL("/not-found-page", request.url), { status: 404 })
}

export const config = {
  matcher: [
    "/products/:slug",
    "/categories/:slug",
    "/categories/:parent/:slug",
    "/collections/:slug",
    "/fabrics/:slug",
    "/prints/:slug",
    "/account/:path*",
    "/admin/:path*",
  ],
}
