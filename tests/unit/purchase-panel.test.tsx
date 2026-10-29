// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { PurchasePanel } from "@/components/storefront/product/purchase-panel"
import type { VariantDTO } from "@/features/catalog/types"
import { units } from "@/lib/measure"
import { useBag } from "@/stores/bag-store"

const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }))
vi.mock("sonner", () => ({ toast }))

const metre = units.perMetre()
const ok = (max: number) => ({ status: "in_stock", label: "In stock", maxOrderable: max }) as const
const id = (n: number) => n.toString(16).padStart(24, "0")

function fabric(): VariantDTO[] {
  return [
    {
      id: id(1),
      sku: "A",
      label: "Sage",
      colorName: "Sage",
      colorHex: "#8a9a7b",
      unit: metre,
      unitLabel: "per metre",
      pricePaise: 18000,
      availability: ok(40_000),
    },
    {
      id: id(2),
      sku: "B",
      label: "Indigo",
      colorName: "Indigo",
      colorHex: "#3d4a6b",
      unit: metre,
      unitLabel: "per metre",
      pricePaise: 25000,
      availability: ok(4_000),
    },
  ]
}

const renderPanel = (variants = fabric()) =>
  render(<PurchasePanel product={{ slug: "handloom-cotton", name: "Handloom cotton", variants }} />)

beforeEach(() => {
  vi.clearAllMocks()
  useBag.setState({ lines: [], hydrated: true })
})

describe("PurchasePanel", () => {
  it("starts at the minimum length and prices it exactly", () => {
    renderPanel()
    expect(screen.getByLabelText(/^Length/)).toHaveValue("0.5")
    expect(screen.getByRole("button", { name: "Add to bag, ₹90" })).toBeEnabled() // 0.5 m x Rs 180
  })

  it("steps by the unit's step and updates the total", async () => {
    renderPanel()
    await userEvent.click(screen.getByRole("button", { name: "Longer" }))
    await userEvent.click(screen.getByRole("button", { name: "Longer" }))
    expect(screen.getByLabelText(/^Length/)).toHaveValue("1.5")
    expect(screen.getByRole("button", { name: "Add to bag, ₹270" })).toBeInTheDocument()
  })

  it("explains an off-grid length and blocks adding", async () => {
    renderPanel()
    const input = screen.getByLabelText(/^Length/)
    await userEvent.clear(input)
    await userEvent.type(input, "2.35")
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a length in steps of 0.5 m.")
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByRole("button", { name: /Add to bag/ })).toBeDisabled()
  })

  it("refuses extra decimal places and non-numbers rather than rounding", async () => {
    renderPanel()
    const input = screen.getByLabelText(/^Length/)
    for (const bad of ["1.2345", "abc", "-1", "1,5", ""]) {
      await userEvent.clear(input)
      if (bad) await userEvent.type(input, bad)
      expect(screen.getByRole("button", { name: /Add to bag/ }), bad).toBeDisabled()
    }
  })

  it("switches variant by colour, repricing and clamping the length to what is available", async () => {
    renderPanel()
    await userEvent.click(screen.getByRole("button", { name: "5 m" }))
    expect(screen.getByRole("button", { name: "Add to bag, ₹900" })).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText("Indigo"))
    // Indigo has 4 m: the 5 m choice is clamped to 4 m, at Rs 250.
    expect(screen.getByLabelText(/^Length/)).toHaveValue("4")
    expect(screen.getByRole("button", { name: "Add to bag, ₹1,000" })).toBeInTheDocument()
  })

  it("adds the exact base-unit quantity to the bag and tells the visitor", async () => {
    renderPanel()
    await userEvent.click(screen.getByRole("button", { name: "2.5 m" }))
    await userEvent.click(screen.getByRole("button", { name: /Add to bag/ }))
    expect(useBag.getState().lines).toEqual([{ variantId: id(1), qty: 2500 }])
    expect(toast.success).toHaveBeenCalledWith("Added to your bag", {
      description: "Handloom cotton, 2.5 m",
    })
  })

  it("accounts for what is already in the bag", async () => {
    const variants = fabric()
    variants[1]!.availability = ok(4_000)
    useBag.setState({ lines: [{ variantId: id(2), qty: 3_000 }], hydrated: true })
    renderPanel(variants)
    await userEvent.click(screen.getByLabelText("Indigo"))
    const input = screen.getByLabelText(/^Length/)
    await userEvent.clear(input)
    await userEvent.type(input, "2")
    expect(screen.getByRole("alert")).toHaveTextContent("Only 1 m is available.")
    expect(screen.getByRole("button", { name: /Add to bag/ })).toBeDisabled()
    await userEvent.clear(input)
    await userEvent.type(input, "1")
    expect(screen.getByRole("button", { name: /Add to bag/ })).toBeEnabled()
  })

  it("shows a sold-out variant as unavailable with no way to add it", () => {
    const variants = fabric().map((v) => ({
      ...v,
      availability: { status: "out_of_stock", label: "Out of stock", maxOrderable: 0 } as const,
    }))
    renderPanel(variants)
    expect(screen.getByRole("button", { name: "Out of stock" })).toBeDisabled()
    expect(screen.queryByLabelText(/^Length/)).not.toBeInTheDocument()
  })

  it("counts whole units for items that are not sold by length", async () => {
    const sized: VariantDTO[] = ["S", "M"].map((size, i) => ({
      id: id(10 + i),
      sku: size,
      label: size,
      size,
      unit: units.each("piece"),
      unitLabel: "each",
      pricePaise: 119900,
      availability: ok(8),
    }))
    renderPanel(sized)
    expect(screen.getByLabelText("Quantity")).toHaveValue("1")
    await userEvent.click(screen.getByRole("button", { name: "Increase quantity" }))
    expect(screen.getByRole("button", { name: "Add to bag, ₹2,398" })).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText("M"))
    await userEvent.click(screen.getByRole("button", { name: /Add to bag/ }))
    expect(useBag.getState().lines).toEqual([{ variantId: id(11), qty: 2 }])
    const input = screen.getByLabelText("Quantity")
    await userEvent.clear(input)
    await userEvent.type(input, "1.5")
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a whole number.")
  })

  it("announces additions to assistive technology", async () => {
    renderPanel()
    await userEvent.click(screen.getByRole("button", { name: /Add to bag/ }))
    await act(async () => {})
    expect(screen.getByText("Added to your bag: Handloom cotton, 0.5 m")).toBeInTheDocument()
  })
})
