import { connection } from "next/server"
import { Suspense } from "react"
import { RichText } from "@/components/content/rich-text"
import { Container } from "@/components/layout/container"
import { PageHeader } from "@/components/layout/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import type { PageSlug } from "@/config/pages"
import { cachedPage } from "@/services/catalog-cache"
import type { ReactNode } from "react"

async function Body({ slug, children }: { slug: PageSlug; children?: ReactNode }) {
  await connection()
  const page = await cachedPage(slug)
  return (
    <>
      <PageHeader
        title={page.title}
        breadcrumbs={[{ label: "Home", href: "/" }, { label: page.title }]}
      />
      <RichText source={page.body} />
      {children}
    </>
  )
}

/** An information page: the owner's wording if saved, otherwise the built-in draft. `children` adds a form or details below. */
export function ContentPageView({ slug, children }: { slug: PageSlug; children?: ReactNode }) {
  return (
    <Container>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Body slug={slug}>{children}</Body>
      </Suspense>
    </Container>
  )
}
