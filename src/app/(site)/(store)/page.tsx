import type { Metadata } from "next"
import { Suspense } from "react"
import { ClosingCta } from "@/components/home/closing-cta"
import { CutToOrder } from "@/components/home/cut-to-order"
import { HeroCarousel } from "@/components/home/hero-carousel"
import { HomeCategoryRail } from "@/components/home/home-category-rail"
import { HomeMotionRoot } from "@/components/home/home-motion-root"
import { HomeOffer } from "@/components/home/home-offer"
import { HomeReviews } from "@/components/home/home-reviews"
import { LooksInMotion } from "@/components/home/looks-in-motion"
import { NewArrivals } from "@/components/home/new-arrivals"
import { Turnaround } from "@/components/home/turnaround"
import { Wardrobe } from "@/components/home/wardrobe"
import { ProductGridSkeleton } from "@/components/storefront/product-card-skeleton"
import { Skeleton } from "@/components/ui/skeleton"
import { home } from "@/content/home"
import { siteDefaults } from "@/config/site"
import { JsonLd, organizationJsonLd } from "@/lib/seo/jsonld"
import { buildMetadata } from "@/lib/seo/metadata"

export const metadata: Metadata = {
  ...buildMetadata({
    title: siteDefaults.name,
    description:
      "Fabrics sold by the metre, dupattas, blouses, ready-made kurtis and dresses, and unstitched suits.",
    path: "/",
  }),
  // The home page carries the whole brand line; the " | Ambar" template would repeat the name.
  title: {
    absolute: `${siteDefaults.name}: fabrics by the metre, dupattas and ready-made clothing`,
  },
}

function ArrivalsFallback() {
  return (
    <div className="home-container py-[120px]">
      <Skeleton className="mb-11 h-12 w-56" />
      <ProductGridSkeleton count={4} />
    </div>
  )
}

/** The scroll-driven home page. Data is read here, on the server; the animated sections are client components. */
export default function HomePage() {
  return (
    <>
      <JsonLd data={organizationJsonLd()} />
      <HomeMotionRoot>
        <HeroCarousel slides={home.hero.slides} secondary={home.hero.secondary} />
        <Wardrobe copy={home.wardrobe} />
        <Suspense fallback={<div className="h-[640px] bg-primary" />}>
          <HomeCategoryRail />
        </Suspense>
        <Turnaround copy={home.turnaround} />
        <LooksInMotion copy={home.lookbook} />
        <CutToOrder copy={home.cutToOrder} />
        <Suspense fallback={<ArrivalsFallback />}>
          <NewArrivals copy={home.newArrivals} />
        </Suspense>
        <Suspense fallback={null}>
          <HomeOffer />
        </Suspense>
        <Suspense fallback={null}>
          <HomeReviews />
        </Suspense>
        <ClosingCta copy={home.closing} />
      </HomeMotionRoot>
    </>
  )
}
