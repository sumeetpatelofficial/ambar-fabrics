import Link from "next/link"
import { notFound } from "next/navigation"
import { connection } from "next/server"
import { Suspense } from "react"
import { Container } from "@/components/layout/container"
import { PageHeader } from "@/components/layout/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { ListingSkeleton } from "@/components/storefront/listing/listing-skeleton"
import { ListingView } from "@/components/storefront/listing/listing-view"
import { listingMetadata } from "@/features/catalog/listing-metadata"
import { breadcrumbJsonLd, JsonLd } from "@/lib/seo/jsonld"
import { buildMetadata, truncateDescription } from "@/lib/seo/metadata"
import type { TaxonKind } from "@/config/taxa"
import { cachedTaxa, cachedTaxon } from "@/services/catalog-cache"

type Raw = Record<string, string | string[] | undefined>

const COPY = {
  fabric: {
    base: "/fabrics",
    many: "Shop by fabric",
    one: "fabric",
    blurb:
      "Every product in a fabric, whatever it is: cloth by the metre, dupattas, blouses, suits and ready-made clothing.",
  },
  print: {
    base: "/prints",
    many: "Shop by print",
    one: "print",
    blurb: "Every product with a print, on any fabric.",
  },
} as const

/** What a fabric or print page fixes about its list, in the form the product filter understands. */
const constraintFor = (kind: TaxonKind, name: string) =>
  kind === "fabric" ? { fabric: [name.toLowerCase()] } : { pattern: [name.toLowerCase()] }

export async function taxonMetadata(kind: TaxonKind, slug: string, searchParams: Promise<Raw>) {
  const taxon = await cachedTaxon(kind, slug)
  if (!taxon)
    return {
      title: `${COPY[kind].one === "fabric" ? "Fabric" : "Print"} not found`,
      robots: { index: false },
    }
  return listingMetadata({
    title: taxon.name,
    description: truncateDescription(
      taxon.description ?? `Shop ${taxon.name}: ${COPY[kind].blurb}`
    ),
    basePath: `${COPY[kind].base}/${slug}`,
    searchParams,
    constraint: constraintFor(kind, taxon.name),
  })
}

async function Index({ kind }: { kind: TaxonKind }) {
  await connection()
  const taxa = await cachedTaxa(kind)
  const c = COPY[kind]
  if (taxa.length === 0) return <p className="text-muted-foreground">Coming soon.</p>
  return (
    <ul className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
      {taxa.map((t) => (
        <li key={t.id} className="flex flex-col gap-3 border-t pt-4">
          <h2 className="text-3xl">
            <Link href={`${c.base}/${t.slug}`} className="underline-offset-4 hover:underline">
              {t.name}
            </Link>
          </h2>
          {t.description ? (
            <p className="text-pretty text-muted-foreground">{t.description}</p>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

export function taxonIndexMetadata(kind: TaxonKind) {
  const c = COPY[kind]
  return buildMetadata({ title: c.many, description: c.blurb, path: c.base })
}

export function TaxonIndexPage({ kind }: { kind: TaxonKind }) {
  const c = COPY[kind]
  return (
    <Container>
      <PageHeader
        title={c.many}
        description={c.blurb}
        breadcrumbs={[{ label: "Home", href: "/" }, { label: c.many }]}
      />
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <Index kind={kind} />
      </Suspense>
    </Container>
  )
}

async function Detail({
  kind,
  params,
  searchParams,
}: {
  kind: TaxonKind
  params: Promise<{ slug: string }>
  searchParams: Promise<Raw>
}) {
  const { slug } = await params
  const taxon = await cachedTaxon(kind, slug)
  if (!taxon) notFound()
  const c = COPY[kind]
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: c.many, path: c.base },
          { name: taxon.name, path: `${c.base}/${slug}` },
        ])}
      />
      <ListingView
        header={{
          title: taxon.name,
          description: taxon.description,
          breadcrumbs: [
            { label: "Home", href: "/" },
            { label: c.many, href: c.base },
            { label: taxon.name },
          ],
        }}
        searchParams={searchParams}
        basePath={`${c.base}/${slug}`}
        constraint={constraintFor(kind, taxon.name)}
        emptyTitle={`No ${taxon.name.toLowerCase()} products match those filters`}
        emptyDescription="Try removing a filter, or browse everything."
      />
    </>
  )
}

export function TaxonDetailPage({
  kind,
  params,
  searchParams,
}: {
  kind: TaxonKind
  params: Promise<{ slug: string }>
  searchParams: Promise<Raw>
}) {
  return (
    <Container>
      <Suspense fallback={<ListingSkeleton />}>
        <Detail kind={kind} params={params} searchParams={searchParams} />
      </Suspense>
    </Container>
  )
}
