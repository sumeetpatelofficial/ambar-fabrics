import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { PackageSearch } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Breadcrumbs } from "@/components/storefront/breadcrumbs"
import { EmptyState } from "@/components/storefront/empty-state"
import { ErrorState } from "@/components/storefront/error-state"
import { FabricPlaceholder } from "@/components/storefront/fabric-placeholder"
import { ProductCard } from "@/components/storefront/product-card"
import { ProductGridSkeleton } from "@/components/storefront/product-card-skeleton"
import { Selvedge } from "@/components/storefront/selvedge"
import { WishlistButton } from "@/components/storefront/wishlist-button"
import { ConfirmDemo, ToastDemo } from "./demos"

export const metadata: Metadata = {
  title: "Component preview",
  robots: { index: false, follow: false },
}

const palette = [
  ["paper", "var(--background)"],
  ["linen", "var(--secondary)"],
  ["ink", "var(--foreground)"],
  ["sage", "var(--primary)"],
  ["madder", "var(--madder)"],
  ["brass", "var(--brass)"],
] as const

type Sample = {
  slug: string
  name: string
  pricePaise: number
  comparePaise?: number
  unitLabel: string
  badge?: string
  soldOut?: boolean
  pattern: "weave" | "bandhani" | "ajrakh" | "stripe" | "block"
  base: string
  ink: string
  alt: { base: string; ink: string; pattern: Sample["pattern"] }
  swatches: { name: string; hex: string }[]
}

// Sample data for visual review only. It is never rendered outside development.
const samples: Sample[] = [
  {
    slug: "handloom-cotton-sage",
    name: "Handloom cotton, sage",
    pricePaise: 18000,
    unitLabel: "per metre",
    pattern: "weave",
    base: "#c9d1bd",
    ink: "#5f7156",
    alt: { pattern: "stripe", base: "#d3d9c6", ink: "#5f7156" },
    swatches: [
      { name: "Sage", hex: "#8a9a7b" },
      { name: "Sand", hex: "#d9cdb4" },
      { name: "Indigo", hex: "#3d4a6b" },
    ],
  },
  {
    slug: "bandhani-dupatta-madder",
    name: "Bandhani dupatta, madder red",
    pricePaise: 129900,
    comparePaise: 159900,
    unitLabel: "each",
    badge: "Sale",
    pattern: "bandhani",
    base: "#b4513c",
    ink: "#f1dfc8",
    alt: { pattern: "bandhani", base: "#9a4431", ink: "#e9cfb0" },
    swatches: [
      { name: "Madder", hex: "#9a4431" },
      { name: "Mustard", hex: "#c79a2d" },
    ],
  },
  {
    slug: "ajrakh-modal-silk",
    name: "Ajrakh print modal silk",
    pricePaise: 42000,
    unitLabel: "per metre",
    badge: "New",
    pattern: "ajrakh",
    base: "#2f3a5a",
    ink: "#d7c9a6",
    alt: { pattern: "ajrakh", base: "#3d1f1a", ink: "#d9b99a" },
    swatches: [
      { name: "Indigo", hex: "#2f3a5a" },
      { name: "Madder", hex: "#7a3a2c" },
      { name: "Ivory", hex: "#eee8da" },
      { name: "Olive", hex: "#6b6a3a" },
      { name: "Charcoal", hex: "#3a3835" },
      { name: "Sand", hex: "#d9cdb4" },
      { name: "Rose", hex: "#c98a86" },
    ],
  },
  {
    slug: "unstitched-suit-block",
    name: "Three-piece unstitched suit, block print",
    pricePaise: 149900,
    unitLabel: "per set",
    pattern: "block",
    base: "#e6dcc3",
    ink: "#3f5a52",
    alt: { pattern: "block", base: "#dfe3d2", ink: "#4b5e45" },
    swatches: [{ name: "Teal", hex: "#3f5a52" }],
  },
  {
    slug: "chinon-sold-out",
    name: "Chinon, dusty rose",
    pricePaise: 26000,
    unitLabel: "per metre",
    soldOut: true,
    pattern: "weave",
    base: "#e2c4bf",
    ink: "#a8706a",
    alt: { pattern: "weave", base: "#e2c4bf", ink: "#a8706a" },
    swatches: [{ name: "Dusty rose", hex: "#c98a86" }],
  },
  {
    slug: "latkan-gold",
    name: "Latkan, antique gold",
    pricePaise: 8000,
    unitLabel: "per pair",
    pattern: "stripe",
    base: "#d8c58f",
    ink: "#8a6a25",
    alt: { pattern: "stripe", base: "#cdb77a", ink: "#8a6a25" },
    swatches: [{ name: "Antique gold", hex: "#a98a3e" }],
  },
]

export default function ComponentPreviewPage() {
  // Hidden in production unless explicitly enabled (the browser-test server sets ENABLE_DEV_PAGES=1).
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_DEV_PAGES !== "1") notFound()

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-16 px-4 py-12 sm:px-6">
      <header className="flex flex-col gap-3">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Development" },
            { label: "Component preview" },
          ]}
        />
        <h1 className="text-5xl sm:text-6xl">Component preview</h1>
        <p className="max-w-prose text-pretty text-muted-foreground">
          Development only. Every storefront building block in one place, with sample content. This
          page returns a 404 in production.
        </p>
      </header>

      <section aria-labelledby="palette" className="flex flex-col gap-4">
        <h2 id="palette" className="text-3xl">
          Colour
        </h2>
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {palette.map(([name, value]) => (
            <li key={name} className="flex flex-col gap-1.5">
              <span className="h-16 border" style={{ backgroundColor: value }} />
              <span className="text-sm">{name}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="type" className="flex flex-col gap-4">
        <h2 id="type" className="text-3xl">
          Type
        </h2>
        <div className="flex flex-col gap-3">
          <p className="font-display text-6xl leading-none">Fabric by the metre</p>
          <p className="font-display text-4xl leading-tight">
            Bandhani and Ajrakh, cut to your length
          </p>
          <p className="max-w-prose text-lg text-pretty">
            Body text is set in a clear grotesque at a comfortable measure. Prices use tabular
            figures so columns of rupees line up:{" "}
            <span className="tabular">₹180, ₹1,299, ₹1,49,900</span>.
          </p>
          <p className="text-sm text-muted-foreground">
            Small and secondary text, still above 4.5:1 contrast.
          </p>
        </div>
      </section>

      <section aria-labelledby="selvedge" className="flex flex-col gap-4">
        <h2 id="selvedge" className="text-3xl">
          Selvedge rule
        </h2>
        <Selvedge />
      </section>

      <section aria-labelledby="buttons" className="flex flex-col gap-4">
        <h2 id="buttons" className="text-3xl">
          Controls
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg">Add to bag</Button>
          <Button>Continue</Button>
          <Button variant="outline">Save for later</Button>
          <Button variant="secondary">Apply coupon</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="link">Size guide</Button>
          <Button disabled>Out of stock</Button>
          <Badge>New</Badge>
          <Badge variant="secondary">Handloom</Badge>
        </div>
        <div className="grid max-w-xl gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="pin">PIN code</Label>
            <Input id="pin" inputMode="numeric" autoComplete="postal-code" placeholder="6 digits" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="bad">Phone number</Label>
            <Input id="bad" aria-invalid="true" aria-describedby="bad-msg" defaultValue="98765" />
            <p id="bad-msg" className="text-sm text-destructive">
              Enter a 10-digit mobile number.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="cards" className="flex flex-col gap-4">
        <h2 id="cards" className="text-3xl">
          Product cards
        </h2>
        <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
          {samples.map((p) => (
            <ProductCard
              key={p.slug}
              href={`/products/${p.slug}`}
              name={p.name}
              pricePaise={p.pricePaise}
              comparePaise={p.comparePaise}
              unitLabel={p.unitLabel}
              badge={p.badge}
              soldOut={p.soldOut}
              swatches={p.swatches}
              primary={<FabricPlaceholder pattern={p.pattern} base={p.base} ink={p.ink} />}
              secondary={
                <FabricPlaceholder pattern={p.alt.pattern} base={p.alt.base} ink={p.alt.ink} />
              }
              actions={<WishlistButton productName={p.name} />}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="loading" className="flex flex-col gap-4">
        <h2 id="loading" className="text-3xl">
          Loading
        </h2>
        <ProductGridSkeleton count={4} />
      </section>

      <section aria-labelledby="feedback" className="flex flex-col gap-4">
        <h2 id="feedback" className="text-3xl">
          Feedback and dialogs
        </h2>
        <ToastDemo />
        <div>
          <ConfirmDemo />
        </div>
      </section>

      <section aria-labelledby="states" className="flex flex-col gap-6">
        <h2 id="states" className="text-3xl">
          Empty and error states
        </h2>
        <EmptyState
          icon={PackageSearch}
          title="No fabrics match those filters"
          description="Try removing a filter, or browse all cotton fabrics."
          action={<Button variant="outline">Clear filters</Button>}
        />
        <div className="border">
          <ErrorState reference="3f9a1c" />
        </div>
      </section>
    </div>
  )
}
