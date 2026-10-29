import { TaxonDetailPage, taxonMetadata } from "@/components/storefront/taxon-pages"

export async function generateMetadata({ params, searchParams }: PageProps<"/fabrics/[slug]">) {
  const { slug } = await params
  return taxonMetadata("fabric", slug, searchParams)
}

export default function Page({ params, searchParams }: PageProps<"/fabrics/[slug]">) {
  return <TaxonDetailPage kind="fabric" params={params} searchParams={searchParams} />
}
