import { siteDefaults } from "@/config/site"
import { paiseToRupeeString } from "@/lib/money"
import { absoluteUrl, truncateDescription } from "@/lib/seo/metadata"
import type { ProductDetailDTO } from "@/features/catalog/types"

/**
 * Serialises structured data for a <script type="application/ld+json"> tag. "<" is escaped so a product
 * name such as "</script>" cannot close the tag, and the line separators that break some parsers are escaped too.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(new RegExp("\\u2028", "g"), "\\u2028")
    .replace(new RegExp("\\u2029", "g"), "\\u2029")
}

/* eslint-disable react/no-danger -- the only place HTML is injected: JSON.stringify output with "<" escaped */
export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  )
}
/* eslint-enable react/no-danger */

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  }
}

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteDefaults.name,
    url: absoluteUrl("/"),
  }
}

/**
 * Product structured data built only from what the page shows: real prices, real availability. Ratings
 * appear only when approved reviews from buyers exist. Fabric sold by length also carries a per-metre price specification.
 */
export function productJsonLd(p: ProductDetailDTO) {
  const url = absoluteUrl(`/products/${p.slug}`)
  const prices = p.variants.map((v) => v.pricePaise)
  const low = Math.min(...prices)
  const high = Math.max(...prices)
  const anyInStock = p.variants.some((v) => v.availability.status !== "out_of_stock")
  const availability = `https://schema.org/${anyInStock ? "InStock" : "OutOfStock"}`
  const perMetre = p.variants[0]?.unit.displayUnit === "m"
  const spec = (paise: number) =>
    perMetre
      ? {
          priceSpecification: {
            "@type": "UnitPriceSpecification",
            price: paiseToRupeeString(paise),
            priceCurrency: "INR",
            referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitCode: "MTR" },
          },
        }
      : {}

  const offers =
    high > low
      ? {
          "@type": "AggregateOffer",
          priceCurrency: "INR",
          lowPrice: paiseToRupeeString(low),
          highPrice: paiseToRupeeString(high),
          offerCount: p.variants.length,
          availability,
          url,
        }
      : {
          "@type": "Offer",
          priceCurrency: "INR",
          price: paiseToRupeeString(low),
          availability,
          itemCondition: "https://schema.org/NewCondition",
          url,
          ...spec(low),
        }

  const description =
    p.shortDescription ?? (p.description ? truncateDescription(p.description, 300) : undefined)
  const images = p.images.map((i) => i.url)
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    url,
    sku: p.variants[0]?.sku,
    ...(description ? { description } : {}),
    ...(images.length ? { image: images } : {}),
    ...(p.attributes.material ? { material: p.attributes.material } : {}),
    ...(p.rating
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: p.rating.avg,
            reviewCount: p.rating.count,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
    offers,
  }
}
