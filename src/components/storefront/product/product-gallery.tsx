"use client"

import { useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { cn } from "cn"
import { ProductArt } from "@/components/storefront/product-art"
import type { ImageDTO, ProductCardDTO } from "@/features/catalog/types"

/**
 * Photo gallery: one large image and a strip of thumbnails. With no photographs yet it shows fabric
 * artwork instead, so the page keeps its shape.
 */
export function ProductGallery({
  images,
  product,
}: {
  images: ImageDTO[]
  product: Pick<ProductCardDTO, "name" | "swatches" | "pattern">
}) {
  const [index, setIndex] = useState(0)
  // Fade only when the visitor picks another photo. The first image must be visible in the server HTML.
  const [changed, setChanged] = useState(false)
  const reduce = useReducedMotion()
  const current = images[index]

  return (
    <div className="flex flex-col gap-3 lg:sticky lg:top-24 lg:self-start">
      <div className="relative aspect-[4/5] overflow-hidden bg-muted">
        <motion.div
          key={current?.url ?? "art"}
          className="absolute inset-0"
          initial={changed && !reduce ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
        >
          <ProductArt
            product={product}
            image={current}
            sizes="(min-width: 1024px) 50vw, 100vw"
            priority
          />
        </motion.div>
      </div>
      {images.length > 1 ? (
        <ul className="grid grid-cols-5 gap-2" aria-label="Photos">
          {images.map((image, i) => (
            <li key={image.url}>
              <button
                type="button"
                onClick={() => {
                  setChanged(true)
                  setIndex(i)
                }}
                aria-label={`Show photo ${i + 1} of ${images.length}`}
                aria-current={i === index}
                className={cn(
                  "relative block aspect-square w-full overflow-hidden border bg-muted",
                  i === index ? "border-foreground" : "opacity-70 hover:opacity-100"
                )}
              >
                <ProductArt product={product} image={image} sizes="96px" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
