import type { Metadata } from "next"
import { categoryMetadata, CategoryPageView } from "@/components/storefront/category-page"

export async function generateMetadata({
  params,
  searchParams,
}: PageProps<"/categories/[slug]">): Promise<Metadata> {
  return categoryMetadata((await params).slug, searchParams)
}

export default function CategoryPage({ params, searchParams }: PageProps<"/categories/[slug]">) {
  return <CategoryPageView params={params} searchParams={searchParams} />
}
