// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { PriceTag } from "@/components/storefront/price-tag"
import { ProductCard } from "@/components/storefront/product-card"
import { ProductGridSkeleton } from "@/components/storefront/product-card-skeleton"
import { EmptyState } from "@/components/storefront/empty-state"
import { Breadcrumbs } from "@/components/storefront/breadcrumbs"
import { WishlistButton } from "@/components/storefront/wishlist-button"
import { ErrorState } from "@/components/storefront/error-state"

describe("PriceTag", () => {
  it("always shows the selling unit next to the price", () => {
    render(<PriceTag pricePaise={18000} unitLabel="per metre" />)
    expect(screen.getByText("₹180")).toBeInTheDocument()
    expect(screen.getByText("per metre")).toBeInTheDocument()
  })

  it("shows the original price (with a screen-reader label) and rounded-down percentage when on sale", () => {
    render(<PriceTag pricePaise={129900} comparePaise={159900} unitLabel="each" />)
    expect(screen.getByText("18% off")).toBeInTheDocument()
    expect(screen.getByText(/Original price/)).toBeInTheDocument()
  })

  it("shows no discount when the compare price is not higher", () => {
    render(<PriceTag pricePaise={1000} comparePaise={1000} />)
    expect(screen.queryByText(/% off/)).not.toBeInTheDocument()
  })
})

describe("ProductCard", () => {
  const base = {
    href: "/products/cotton",
    name: "Handloom cotton, sage",
    primary: <div data-testid="primary" />,
    pricePaise: 18000,
    unitLabel: "per metre",
  }

  it("makes the product name the single link to the product page", () => {
    render(<ProductCard {...base} />)
    expect(screen.getByRole("link", { name: "Handloom cotton, sage" })).toHaveAttribute(
      "href",
      "/products/cotton"
    )
    expect(screen.getAllByRole("link")).toHaveLength(1)
  })

  it("labels colours for assistive technology and caps the visible swatches", () => {
    const swatches = Array.from({ length: 8 }, (_, i) => ({
      name: `Colour ${i + 1}`,
      hex: "#abcdef",
    }))
    render(<ProductCard {...base} swatches={swatches} />)
    const list = screen.getByRole("list", { name: "Available colours" })
    expect(within(list).getAllByRole("listitem")).toHaveLength(7) // 6 swatches + "+2"
    expect(within(list).getByText("+2")).toBeInTheDocument()
  })

  it("flags sold-out products and renders badge and actions", () => {
    render(<ProductCard {...base} soldOut badge="New" actions={<button>Heart</button>} />)
    expect(screen.getByText("Sold out")).toBeInTheDocument()
    expect(screen.getByText("New")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Heart" })).toBeInTheDocument()
  })
})

describe("WishlistButton", () => {
  it("toggles aria-pressed, updates its label, and reports the change", async () => {
    const onChange = vi.fn()
    render(<WishlistButton productName="Cotton" onPressedChange={onChange} />)
    const button = screen.getByRole("button", { name: "Add Cotton to wishlist" })
    expect(button).toHaveAttribute("aria-pressed", "false")
    await userEvent.click(button)
    expect(screen.getByRole("button", { name: "Remove Cotton from wishlist" })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    expect(onChange).toHaveBeenCalledWith(true)
  })
})

describe("states and navigation", () => {
  it("skeleton grid announces loading once", () => {
    render(<ProductGridSkeleton count={3} />)
    expect(screen.getByRole("status", { name: "Loading products" })).toBeInTheDocument()
  })

  it("empty state names the problem and offers the next step", () => {
    render(
      <EmptyState
        title="No fabrics match"
        description="Remove a filter."
        action={<button>Clear filters</button>}
      />
    )
    expect(screen.getByRole("heading", { name: "No fabrics match" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument()
  })

  it("error state is an alert, shows only the reference, and retries", async () => {
    const retry = vi.fn()
    render(<ErrorState reference="abc" onRetry={retry} />)
    expect(screen.getByRole("alert")).toBeInTheDocument()
    expect(screen.getByText("Reference: abc")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(retry).toHaveBeenCalledOnce()
  })

  it("breadcrumbs mark the current page and link the rest", () => {
    render(
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Fabrics", href: "/categories/fabrics" },
          { label: "Cotton" },
        ]}
      />
    )
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/")
    expect(screen.getByRole("link", { name: "Fabrics" })).toBeInTheDocument()
    expect(screen.getByText("Cotton")).toHaveAttribute("aria-current", "page")
  })
})
