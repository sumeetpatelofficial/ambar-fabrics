import { TrackedList } from "@/components/analytics/track-events"
import { ProductArt } from "@/components/storefront/product-art"
import { ProductCard } from "@/components/storefront/product-card"
import { QuickAdd } from "@/components/storefront/quick-add"
import { WishlistToggle } from "@/components/storefront/wishlist-toggle"
import type { ProductCardDTO } from "@/features/catalog/types"
import { cn } from "cn"

const SIZES = "(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"

/** Cards for a list of catalogue products. The first few images load eagerly (they are above the fold). */
export function ProductGrid({
  items,
  className,
  columns = "four",
  headingLevel = 3,
  listName,
  quickAdd = false,
  ratio,
}: {
  items: ProductCardDTO[]
  className?: string
  columns?: "four" | "three"
  headingLevel?: 2 | 3
  /** Names this list in analytics (its page address, for example). Without it nothing is reported. */
  listName?: string
  /** Show a quantity and an "Add" button on each card that has options to add. */
  quickAdd?: boolean
  /** Shape of each picture. */
  ratio?: "square" | "portrait"
}) {
  const grid = (
    <ul
      className={cn(
        "grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3",
        columns === "four" && "lg:grid-cols-4",
        className
      )}
    >
      {items.map((p, index) => (
        <li key={p.id} className="h-full">
          <ProductCard
            href={`/products/${p.slug}`}
            name={p.name}
            pricePaise={p.pricePaise}
            comparePaise={p.comparePaise}
            unitLabel={p.hasPriceRange ? `from, ${p.unitLabel}` : p.unitLabel}
            badge={p.badge}
            soldOut={p.soldOut}
            rating={p.rating}
            swatches={p.swatches}
            primary={<ProductArt product={p} image={p.image} sizes={SIZES} priority={index < 2} />}
            secondary={
              p.secondImage ? (
                <ProductArt product={p} image={p.secondImage} sizes={SIZES} />
              ) : undefined
            }
            headingLevel={headingLevel}
            ratio={ratio}
            actions={
              <WishlistToggle slug={p.slug} productName={p.name} pricePaise={p.pricePaise} />
            }
          />
        </li>
      ))}
    </ul>
  )
  return listName ? (
    <TrackedList listName={listName} products={items}>
      {grid}
    </TrackedList>
  ) : (
    grid
  )
}
