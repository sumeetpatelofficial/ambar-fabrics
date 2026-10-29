import type { Availability } from "@/lib/inventory"
import type { SellingUnit } from "@/lib/measure"

/**
 * Plain, serialisable shapes returned by the catalogue services. They contain no Mongoose documents,
 * ObjectIds or Dates, so they can cross cache boundaries and be sent to the browser as-is.
 */
export type ImageDTO = { url: string; alt: string; width?: number; height?: number }
export type SwatchDTO = { name: string; hex: string }
export type SeoDTO = {
  title?: string
  description?: string
  canonical?: string
  noindex?: boolean
  ogImage?: string
}

export type ProductCardDTO = {
  id: string
  slug: string
  name: string
  image: ImageDTO | null
  secondImage: ImageDTO | null
  /** Lowest effective price across variants ("from" price when `hasPriceRange`). */
  pricePaise: number
  priceMaxPaise: number
  hasPriceRange: boolean
  /** Struck-through price of the lowest-priced variant, when it is on sale. */
  comparePaise?: number
  unitLabel: string
  badge?: "New" | "Sale"
  swatches: SwatchDTO[]
  soldOut: boolean
  /** Used to draw placeholder artwork until real photography exists. */
  pattern?: string
  fabricType?: string
  /** From approved reviews only; absent until there is at least one. */
  rating?: { avg: number; count: number }
  /** What the card's quick "add to bag" needs. Present on product lists, absent where cards are built from less. */
  quick?: QuickVariantDTO[]
}

/** A buyable option of a product, as much as a list card needs to add it to the bag. */
export type QuickVariantDTO = Pick<
  VariantDTO,
  "id" | "label" | "colorName" | "size" | "unit" | "unitLabel" | "pricePaise" | "availability"
>

export type VariantDTO = {
  id: string
  sku: string
  /** Human label, such as "Sage" or "Indigo, 2 m minimum". */
  label: string
  colorName?: string
  colorHex?: string
  size?: string
  unit: SellingUnit
  unitLabel: string
  pricePaise: number
  comparePaise?: number
  /** Status and wording only. Exact stock is never exposed above the low-stock threshold. */
  availability: Availability
  imageUrl?: string
}

export type BreadcrumbDTO = { name: string; slug: string }

export type ProductDetailDTO = ProductCardDTO & {
  shortDescription?: string
  description?: string
  images: ImageDTO[]
  attributes: {
    fabricType?: string
    material?: string
    composition?: string
    pattern?: string
    colorFamily: string[]
    widthMm?: number
    careInstructions: string[]
    origin?: string
    occasion: string[]
  }
  returnable: boolean
  /** The master fabric and print, with their pages in the shop (absent when hidden or not set). */
  fabric?: { name: string; slug: string }
  print?: { name: string; slug: string }
  variants: VariantDTO[]
  breadcrumbs: BreadcrumbDTO[]
  seo?: SeoDTO
  updatedAt: string
}

export type TaxonDTO = { id: string; name: string; slug: string; description?: string }

export type CategoryDTO = {
  id: string
  name: string
  slug: string
  description?: string
  image?: ImageDTO
  parentSlug?: string
  seo?: SeoDTO
}
export type CategoryNodeDTO = CategoryDTO & { children: CategoryDTO[] }
export type CategoryDetailDTO = CategoryDTO & {
  breadcrumbs: BreadcrumbDTO[]
  children: CategoryDTO[]
}

export type CollectionDTO = {
  id: string
  name: string
  slug: string
  description?: string
  image?: ImageDTO
  seo?: SeoDTO
}

export type FacetValue = { value: string; count: number }
export type Facets = {
  fabric: FacetValue[]
  color: FacetValue[]
  pattern: FacetValue[]
  price: { minPaise: number; maxPaise: number } | null
}

export type ProductListDTO = {
  items: ProductCardDTO[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  facets: Facets
  category?: CategoryDetailDTO
  collection?: CollectionDTO
}

export type SuggestDTO = {
  products: {
    slug: string
    name: string
    image: ImageDTO | null
    pricePaise: number
    unitLabel: string
  }[]
  categories: { slug: string; name: string }[]
}

export type PublicSettingsDTO = {
  storeName: string
  currency: "INR"
  announcement?: { text: string; href?: string }
  freeShippingThresholdPaise?: number
  taxEnabled: boolean
}
