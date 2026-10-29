import { connection } from "next/server"
import { home } from "@/content/home"
import { categoryHref } from "@/lib/category-url"
import { CategoryRail, type RailCard } from "@/components/home/category-rail"
import { cachedCategoryTree } from "@/services/catalog-cache"

/** Reads the real categories and hands the rail the cards in the order the content file names. */
export async function HomeCategoryRail() {
  await connection() // read per request, never baked into the build
  const tree = await cachedCategoryTree()
  const bySlug = new Map<
    string,
    { slug: string; parentSlug?: string; image?: { url: string; alt: string } }
  >()
  for (const top of tree) {
    bySlug.set(top.slug, { slug: top.slug, image: top.image })
    for (const child of top.children)
      bySlug.set(child.slug, { slug: child.slug, parentSlug: top.slug, image: child.image })
  }
  const cards: RailCard[] = []
  for (const slug of home.categories.order) {
    const found = bySlug.get(slug)
    const copy = home.categories.copy[slug]
    if (!found || !copy) continue
    cards.push({
      title: copy.title,
      sub: copy.sub,
      pattern: copy.pattern,
      href: categoryHref(found.slug, found.parentSlug),
      image: found.image,
    })
  }
  if (cards.length === 0) return null
  return (
    <CategoryRail
      eyebrow={home.categories.eyebrow}
      title={home.categories.title}
      titleEm={home.categories.titleEm}
      intro={home.categories.intro}
      allLabel={home.categories.allLabel}
      allHref="/categories"
      cards={cards}
    />
  )
}
