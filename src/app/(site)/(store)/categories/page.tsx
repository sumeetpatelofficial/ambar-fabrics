import { categoryHref } from "@/lib/category-url"
import { connection } from "next/server"
import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { Container } from "@/components/layout/container"
import { PageHeader } from "@/components/layout/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { buildMetadata } from "@/lib/seo/metadata"
import { cachedCategoryTree } from "@/services/catalog-cache"

const description =
  "Browse fabrics by the metre, dupattas, blouses, ready-made clothing and unstitched suits."

export const metadata: Metadata = buildMetadata({
  title: "All categories",
  description,
  path: "/categories",
})

async function CategoryList() {
  await connection() // data is read per request, never baked into the build
  const tree = await cachedCategoryTree()
  if (tree.length === 0) {
    return <p className="text-muted-foreground">Categories will appear here soon.</p>
  }
  return (
    <ul className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
      {tree.map((category) => (
        <li key={category.id} className="flex flex-col gap-3 border-t pt-4">
          <h2 className="text-3xl">
            <Link
              href={`/categories/${category.slug}`}
              className="underline-offset-4 hover:underline"
            >
              {category.name}
            </Link>
          </h2>
          {category.description ? (
            <p className="text-pretty text-muted-foreground">{category.description}</p>
          ) : null}
          {category.children.length > 0 ? (
            <ul className="flex flex-col">
              {category.children.map((child) => (
                <li key={child.id}>
                  <Link
                    href={categoryHref(child.slug, category.slug)}
                    className="inline-flex min-h-10 items-center text-[0.95rem] text-muted-foreground hover:text-foreground"
                  >
                    {child.name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

export default function CategoriesPage() {
  return (
    <Container>
      <PageHeader
        title="All categories"
        description={description}
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Categories" }]}
      />
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <CategoryList />
      </Suspense>
    </Container>
  )
}
