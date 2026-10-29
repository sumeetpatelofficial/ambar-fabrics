import type { Metadata } from "next"
import { categoryMetadata, CategoryPageView } from "@/components/storefront/category-page"

export async function generateMetadata({
  params,
  searchParams,
}: PageProps<"/categories/[slug]/[child]">): Promise<Metadata> {
  return categoryMetadata((await params).child, searchParams)
}

export default function SubCategoryPage({
  params,
  searchParams,
}: PageProps<"/categories/[slug]/[child]">) {
  return <CategoryPageView params={params} searchParams={searchParams} />
}
