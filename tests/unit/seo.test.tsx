import { describe, expect, it } from "vitest"
import { darken, lighten, luminance, mix } from "@/lib/color"
import {
  breadcrumbJsonLd,
  organizationJsonLd,
  productJsonLd,
  serializeJsonLd,
} from "@/lib/seo/jsonld"
import { absoluteUrl, buildMetadata, truncateDescription } from "@/lib/seo/metadata"
import { units } from "@/lib/measure"
import type { ProductDetailDTO, VariantDTO } from "@/features/catalog/types"

/** The parts of the structured data these tests read, so assertions stay typed. */
type Ld = {
  "@type": string
  name?: string
  sku?: string
  url?: string
  image?: string[]
  aggregateRating?: unknown
  review?: unknown
  telephone?: unknown
  address?: unknown
  offers: {
    "@type": string
    price?: string
    lowPrice?: string
    highPrice?: string
    offerCount?: number
    priceCurrency?: string
    availability?: string
    priceSpecification?: {
      price?: string
      referenceQuantity?: { value?: number; unitCode?: string }
    }
  }
  itemListElement: { position: number; item: string }[]
}
const ld = (value: unknown) => value as Ld
const twitterCard = (m: ReturnType<typeof buildMetadata>) =>
  (m.twitter as { card?: string } | null | undefined)?.card

const variant = (over: Partial<VariantDTO> = {}): VariantDTO => ({
  id: "a".repeat(24),
  sku: "DEMO-001-SAGE",
  label: "Sage",
  unit: units.perMetre(),
  unitLabel: "per metre",
  pricePaise: 18000,
  availability: { status: "in_stock", label: "In stock", maxOrderable: 40_000 },
  ...over,
})

const product = (over: Partial<ProductDetailDTO> = {}): ProductDetailDTO =>
  ({
    id: "p".repeat(24),
    slug: "handloom-cotton",
    name: "Handloom cotton",
    image: null,
    secondImage: null,
    pricePaise: 18000,
    priceMaxPaise: 18000,
    hasPriceRange: false,
    unitLabel: "per metre",
    swatches: [],
    soldOut: false,
    images: [],
    attributes: { colorFamily: [], careInstructions: [], occasion: [] },
    returnable: false,
    variants: [variant()],
    breadcrumbs: [],
    updatedAt: "2026-10-14T00:00:00.000Z",
    ...over,
  }) as ProductDetailDTO

const SOLD_OUT = { status: "out_of_stock", label: "Out of stock", maxOrderable: 0 } as const

describe("serializeJsonLd", () => {
  it("cannot be broken out of its script tag", () => {
    const out = serializeJsonLd({ name: "</script><script>alert(1)</script>", note: "line sep" })
    expect(out).not.toContain("</script>")
    expect(out).not.toContain("<")
    expect(out).not.toContain(" ")
    expect(JSON.parse(out)).toEqual({
      name: "</script><script>alert(1)</script>",
      note: "line sep",
    })
  })
})

describe("productJsonLd", () => {
  it("describes a per-metre fabric with a per-metre price specification", () => {
    const data = ld(productJsonLd(product()))
    expect(data["@type"]).toBe("Product")
    expect(data.sku).toBe("DEMO-001-SAGE")
    expect(data.offers).toMatchObject({
      "@type": "Offer",
      price: "180.00",
      priceCurrency: "INR",
      availability: "https://schema.org/InStock",
    })
    expect(data.offers.priceSpecification).toMatchObject({
      price: "180.00",
      referenceQuantity: { value: 1, unitCode: "MTR" },
    })
    expect(data.url).toBe(absoluteUrl("/products/handloom-cotton"))
  })

  it("uses an aggregate offer when variants are priced differently", () => {
    const data = ld(
      productJsonLd(
        product({
          variants: [variant(), variant({ id: "b".repeat(24), sku: "X-2", pricePaise: 25000 })],
        })
      )
    )
    expect(data.offers).toMatchObject({
      "@type": "AggregateOffer",
      lowPrice: "180.00",
      highPrice: "250.00",
      offerCount: 2,
    })
  })

  it("reports out of stock only when every variant is", () => {
    const allGone = ld(productJsonLd(product({ variants: [variant({ availability: SOLD_OUT })] })))
    expect(allGone.offers.availability).toBe("https://schema.org/OutOfStock")
    const someLeft = ld(
      productJsonLd(
        product({ variants: [variant({ availability: SOLD_OUT }), variant({ sku: "Y" })] })
      )
    )
    expect(someLeft.offers.availability).toBe("https://schema.org/InStock")
  })

  it("never invents ratings, and omits images and the per-metre spec when it has none", () => {
    const data = ld(productJsonLd(product({ variants: [variant({ unit: units.each("set") })] })))
    expect(data.aggregateRating).toBeUndefined()
    expect(data.review).toBeUndefined()
    expect(data.image).toBeUndefined()
    expect(data.offers.priceSpecification).toBeUndefined()
  })

  it("includes absolute image URLs when photos exist", () => {
    const data = ld(
      productJsonLd(
        product({ images: [{ url: "https://res.cloudinary.com/x/a.jpg", alt: "Sage cotton" }] })
      )
    )
    expect(data.image).toEqual(["https://res.cloudinary.com/x/a.jpg"])
  })
})

describe("breadcrumb and organisation data", () => {
  it("numbers crumbs from 1 with absolute URLs", () => {
    const data = ld(
      breadcrumbJsonLd([
        { name: "Home", path: "/" },
        { name: "Fabrics", path: "/categories/fabrics" },
      ])
    )
    expect(data.itemListElement.map((i) => i.position)).toEqual([1, 2])
    expect(data.itemListElement[1]?.item).toBe(absoluteUrl("/categories/fabrics"))
  })

  it("names the organisation without inventing contact details", () => {
    const data = ld(organizationJsonLd())
    expect(data).toMatchObject({ "@type": "Organization", name: "Ambar" })
    expect(data.telephone).toBeUndefined()
    expect(data.address).toBeUndefined()
  })
})

describe("buildMetadata", () => {
  it("sets an absolute canonical and social cards", () => {
    const m = buildMetadata({
      title: "Cotton",
      description: "Soft cotton.",
      path: "/categories/cotton-fabrics",
    })
    expect(m.alternates?.canonical).toBe(absoluteUrl("/categories/cotton-fabrics"))
    expect(m.openGraph).toMatchObject({
      locale: "en_IN",
      siteName: "Ambar",
      type: "website",
    })
    expect(twitterCard(m)).toBe("summary")
    expect(m.robots).toBeUndefined()
  })

  it("marks noindex pages as index:false, follow:true and uses the large card with an image", () => {
    const m = buildMetadata({
      title: "x",
      path: "/search",
      noindex: true,
      image: { url: "https://x/y.jpg" },
    })
    expect(m.robots).toEqual({ index: false, follow: true })
    expect(twitterCard(m)).toBe("summary_large_image")
  })

  it("builds the home canonical without a trailing slash", () => {
    expect(absoluteUrl("/")).toBe(absoluteUrl(""))
    expect(absoluteUrl("/")).not.toMatch(/\/$/)
  })
})

describe("truncateDescription", () => {
  it("leaves short text alone and collapses whitespace", () => {
    expect(truncateDescription("  Soft   cotton\n cloth ")).toBe("Soft cotton cloth")
  })

  it("cuts at a word boundary within the limit and adds an ellipsis", () => {
    const out = truncateDescription("word ".repeat(60), 50)
    expect(out.length).toBeLessThanOrEqual(50)
    expect(out.endsWith("…")).toBe(true)
    expect(out).not.toMatch(/wor…$/)
  })
})

describe("colour helpers", () => {
  it("measures luminance from black to white", () => {
    expect(luminance("#000000")).toBe(0)
    expect(luminance("#ffffff")).toBeCloseTo(1, 5)
    expect(luminance("#eee8da")).toBeGreaterThan(0.55) // pale
    expect(luminance("#3d4a6b")).toBeLessThan(0.55) // deep
  })

  it("mixes toward white or black and stays valid hex", () => {
    expect(lighten("#000000", 1)).toBe("#ffffff")
    expect(darken("#ffffff", 1)).toBe("#000000")
    expect(mix("#ff0000", "#0000ff", 0.5)).toBe("#800080")
    expect(lighten("not-a-colour", 0.5)).toMatch(/^#[0-9a-f]{6}$/)
  })
})
