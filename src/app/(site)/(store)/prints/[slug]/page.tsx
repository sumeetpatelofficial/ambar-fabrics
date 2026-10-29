import { TaxonDetailPage, taxonMetadata } from "@/components/storefront/taxon-pages"

export async function generateMetadata({ params, searchParams }: PageProps<"/prints/[slug]">) {
  const { slug } = await params
  return taxonMetadata("print", slug, searchParams)
}

export default function Page({ params, searchParams }: PageProps<"/prints/[slug]">) {
  return <TaxonDetailPage kind="print" params={params} searchParams={searchParams} />
}
