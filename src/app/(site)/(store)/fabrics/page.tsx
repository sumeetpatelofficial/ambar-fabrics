import { TaxonIndexPage, taxonIndexMetadata } from "@/components/storefront/taxon-pages"

export const metadata = taxonIndexMetadata("fabric")

export default function Page() {
  return <TaxonIndexPage kind="fabric" />
}
