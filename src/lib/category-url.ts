/**
 * Public category addresses. A top-level category is `/categories/fabrics`; a sub-category sits under
 * its parent: `/categories/fabrics/modal-silk-fabrics`. The old single-segment address of a sub-category
 * is answered with a permanent redirect to the new one (see the proxy), so links and search results
 * that already exist keep working.
 */
export function categoryHref(slug: string, parentSlug?: string | null): string {
  return parentSlug ? `/categories/${parentSlug}/${slug}` : `/categories/${slug}`
}

/** Breadcrumb entries (parent first) with their addresses. */
export function breadcrumbLinks<T extends { slug: string }>(crumbs: T[]): (T & { href: string })[] {
  return crumbs.map((c, i) => ({
    ...c,
    href: `/categories/${crumbs
      .slice(0, i + 1)
      .map((x) => x.slug)
      .join("/")}`,
  }))
}
