import Image from "next/image"
import { FabricPlaceholder, type FabricPattern } from "@/components/storefront/fabric-placeholder"
import { darken, lighten, luminance } from "@/lib/color"
import type { ImageDTO, ProductCardDTO } from "@/features/catalog/types"

const PATTERNS: Record<string, FabricPattern> = {
  bandhani: "bandhani",
  ajrakh: "ajrakh",
  "block print": "block",
  block: "block",
  stripe: "stripe",
  striped: "stripe",
}

export function patternFor(name?: string): FabricPattern {
  return (name && PATTERNS[name.toLowerCase()]) || "weave"
}

/** A real photograph when one exists, otherwise fabric artwork drawn from the product's own colour. */
export function ProductArt({
  product,
  image,
  sizes,
  priority = false,
  className,
}: {
  product: Pick<ProductCardDTO, "name" | "swatches" | "pattern">
  image?: ImageDTO | null
  sizes: string
  priority?: boolean
  className?: string
}) {
  if (image) {
    return (
      <Image
        src={image.url}
        alt={image.alt}
        fill
        sizes={sizes}
        priority={priority}
        className={className ?? "object-cover"}
      />
    )
  }
  const hex = product.swatches[0]?.hex ?? "#d9cdb4"
  // Pale fabrics (ivory, sand) keep their colour and get a darker weave so the texture stays visible;
  // deeper colours are softened for the background and keep their own colour as the ink.
  const pale = luminance(hex) > 0.55
  return (
    <FabricPlaceholder
      pattern={patternFor(product.pattern)}
      base={pale ? hex : lighten(hex, 0.45)}
      ink={pale ? darken(hex, 0.5) : darken(hex, 0.1)}
    />
  )
}
