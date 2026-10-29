import { TaxonIndexPage, taxonIndexMetadata } from "@/components/storefront/taxon-pages"

export const metadata = taxonIndexMetadata("print")

export default function Page() {
  return <TaxonIndexPage kind="print" />
}
