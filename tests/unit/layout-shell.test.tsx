// @vitest-environment jsdom
import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { useBag } from "@/stores/bag-store"
import { SiteHeader } from "@/components/layout/site-header"
import { SiteFooter } from "@/components/layout/site-footer"
import { AnnouncementBar } from "@/components/layout/announcement-bar"
import NotFound from "@/app/not-found"
import ErrorPage from "@/app/error"

// Async server components (use cache) cannot render in jsdom; the year is covered by the production build.
vi.mock("@/components/layout/current-year", () => ({ CurrentYear: () => <>2026</> }))

describe("layout shell", () => {
  it("renders the home link, labelled navigation and named icon buttons", () => {
    render(<SiteHeader />)
    const header = within(screen.getByRole("banner"))
    expect(header.getByRole("link", { name: "Ambar" })).toHaveAttribute("href", "/")
    expect(header.getByRole("button", { name: "Open menu" })).toHaveAttribute(
      "aria-expanded",
      "false"
    )
    expect(header.getByRole("button", { name: "Search" })).toBeInTheDocument()
    expect(header.getByRole("link", { name: "Bag" })).toHaveAttribute("href", "/cart")
  })

  it("shows the bag count in its accessible name only once the stored bag has loaded and has items", () => {
    useBag.setState({ lines: [], hydrated: true })
    const { unmount } = render(<SiteHeader />)
    expect(screen.getByRole("link", { name: "Bag" })).toBeInTheDocument()
    unmount()
    act(() =>
      useBag.setState({ lines: [{ variantId: "a".repeat(24), qty: 1000 }], hydrated: true })
    )
    render(<SiteHeader />)
    expect(screen.getByRole("link", { name: "Bag, 1 item" })).toBeInTheDocument()
    act(() => useBag.setState({ lines: [], hydrated: false }))
  })

  it("renders the footer and announcement", () => {
    render(
      <>
        <AnnouncementBar />
        <SiteFooter />
      </>
    )
    expect(screen.getByRole("contentinfo")).toBeInTheDocument()
  })

  it("not-found offers a way home", () => {
    render(<NotFound />)
    expect(screen.getByRole("heading", { name: "We could not find that page" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/")
  })

  it("error boundary shows a safe message and calls retry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const retry = vi.fn()
    const error = Object.assign(new Error("secret db detail"), { digest: "abc123" })
    render(<ErrorPage error={error} retry={retry} />)
    expect(screen.queryByText(/secret db detail/)).not.toBeInTheDocument()
    expect(screen.getByText(/abc123/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(retry).toHaveBeenCalledOnce()
  })
})

describe("account link", () => {
  it("goes to sign in for visitors and to the account for signed-in customers", () => {
    const { unmount } = render(<SiteHeader />)
    expect(
      within(screen.getByRole("banner")).getByRole("link", { name: "Sign in" })
    ).toHaveAttribute("href", "/login")
    unmount()
    globalThis.__testSessionStatus = "authenticated"
    render(<SiteHeader />)
    expect(
      within(screen.getByRole("banner")).getByRole("link", { name: "Your account" })
    ).toHaveAttribute("href", "/account")
  })
})
