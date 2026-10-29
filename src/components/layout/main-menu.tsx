"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"
import { Plus } from "lucide-react"
import { cn } from "cn"
import { mainNav, type NavItem } from "@/config/navigation"

/** Every link in a category's groups, in one list, ending with a link to the whole category. */
function subLinks(item: NavItem) {
  const links = (item.groups ?? []).flatMap((g) => g.links)
  return [...links, { label: `All ${item.label.toLowerCase()}`, href: item.href }]
}

const account = [
  { label: "Your account", href: "/account" },
  { label: "Wishlist", href: "/account/wishlist" },
  { label: "Track your order", href: "/track-order" },
  { label: "Contact", href: "/contact" },
]

/**
 * The one menu for every screen size: a hamburger that turns into a cross, and a panel that slides in
 * beneath the header with each main category set large. Categories with sub-categories expand in place.
 * The panel is not modal: the header stays usable, and Escape, the dimmed page or any link closes it.
 */
export function MainMenu() {
  // The menu is open for the page it was opened on, so moving to another page closes it.
  const pathname = usePathname()
  const [openFor, setOpenFor] = useState<string | null>(null)
  const open = openFor !== null && openFor === pathname
  const setOpen = (next: boolean | ((was: boolean) => boolean)) =>
    setOpenFor((was) =>
      (typeof next === "function" ? next(was === pathname) : next) ? pathname : null
    )
  const [expanded, setExpanded] = useState<string | null>(null)
  const [top, setTop] = useState(64)
  // False on the server and during hydration, true afterwards: the panel is drawn into the page body.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )
  const burger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  // While open: the panel starts at the bottom edge of the header, the page behind stays put, Escape closes.
  useEffect(() => {
    if (!open) return
    const place = () => {
      const header = burger.current?.closest("header")
      if (header) setTop(Math.round(header.getBoundingClientRect().bottom))
    }
    place()
    window.addEventListener("resize", place)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenFor(null)
        burger.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    const html = document.documentElement
    const was = html.style.overflow
    html.style.overflow = "hidden"
    panel.current?.querySelector<HTMLElement>("a")?.focus({ preventScroll: true })
    return () => {
      window.removeEventListener("resize", place)
      window.removeEventListener("keydown", onKey)
      html.style.overflow = was
    }
  }, [open])

  const close = () => setOpen(false)

  return (
    <>
      <button
        ref={burger}
        type="button"
        aria-expanded={open}
        aria-controls="main-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((o) => !o)}
        className="group relative size-11 cursor-pointer rounded-lg hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            aria-hidden="true"
            className={cn(
              "absolute left-3 h-0.5 rounded-full bg-primary transition-all duration-300 ease-[cubic-bezier(.6,.05,.2,1)] motion-reduce:transition-none",
              i === 0 &&
                "top-[15px] w-[22px] group-aria-expanded:top-[21px] group-aria-expanded:rotate-45",
              i === 1 &&
                "top-[21px] w-[15px] group-aria-expanded:-translate-x-2 group-aria-expanded:opacity-0",
              i === 2 &&
                "top-[27px] w-[22px] group-aria-expanded:top-[21px] group-aria-expanded:-rotate-45"
            )}
          />
        ))}
      </button>

      {mounted
        ? createPortal(
            <div data-open={open} className="group/menu">
              <button
                type="button"
                tabIndex={-1}
                aria-label="Close menu"
                onClick={close}
                style={{ top }}
                className="invisible fixed inset-x-0 bottom-0 z-30 cursor-pointer bg-primary/45 opacity-0 transition-opacity duration-300 group-data-[open=true]/menu:visible group-data-[open=true]/menu:opacity-100 motion-reduce:transition-none"
              />
              <div
                id="main-menu"
                ref={panel}
                role="dialog"
                aria-label="Main menu"
                inert={!open}
                style={{ top }}
                className="invisible fixed bottom-0 left-0 z-30 flex w-[min(26rem,100%)] -translate-x-full flex-col bg-background transition-transform duration-500 ease-[cubic-bezier(.7,0,.2,1)] group-data-[open=true]/menu:visible group-data-[open=true]/menu:translate-x-0 motion-reduce:transition-none"
              >
                <nav aria-label="Main" className="flex-1 overflow-y-auto px-6 pt-2 pb-2">
                  <ul>
                    {mainNav.map((item, i) => {
                      const subs = item.groups ? subLinks(item) : null
                      const isOpen = expanded === item.label
                      return (
                        <li
                          key={item.label}
                          style={{ animationDelay: `${i * 45 + 180}ms` }}
                          className="menu-item border-b"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <Link
                              href={item.href}
                              onClick={close}
                              className={cn(
                                "flex-1 py-4 font-display text-[2rem] leading-tight underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring",
                                item.emphasis === "sale" ? "text-highlight" : "text-foreground"
                              )}
                            >
                              {item.label}
                            </Link>
                            {subs ? (
                              <button
                                type="button"
                                aria-expanded={isOpen}
                                aria-controls={`sub-${i}`}
                                aria-label={`${isOpen ? "Hide" : "Show"} ${item.label} sub-categories`}
                                onClick={() => setExpanded(isOpen ? null : item.label)}
                                className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg text-primary hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                              >
                                <Plus
                                  aria-hidden="true"
                                  className={cn(
                                    "size-5 transition-transform duration-300 motion-reduce:transition-none",
                                    isOpen && "rotate-45"
                                  )}
                                />
                              </button>
                            ) : null}
                          </div>
                          {subs ? (
                            <div
                              id={`sub-${i}`}
                              className={cn(
                                "grid transition-[grid-template-rows] duration-300 motion-reduce:transition-none",
                                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                              )}
                            >
                              <div
                                className={cn(
                                  "overflow-hidden",
                                  // Hidden for everyone once the fold has closed (after its short slide).
                                  !isOpen &&
                                    "invisible transition-[visibility] delay-300 duration-0"
                                )}
                                inert={!isOpen}
                              >
                                <ul className="grid grid-cols-2 gap-x-4 pt-1 pb-4">
                                  {subs.map((s) => (
                                    <li key={s.href + s.label}>
                                      <Link
                                        href={s.href}
                                        onClick={close}
                                        className="block py-2 text-base text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
                                      >
                                        {s.label}
                                      </Link>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                </nav>
                <div className="border-t bg-secondary px-6 py-5 text-sm">
                  <ul className="flex flex-wrap gap-x-5 gap-y-1">
                    {account.map((a) => (
                      <li key={a.href}>
                        <Link
                          href={a.href}
                          onClick={close}
                          className="inline-flex min-h-9 items-center underline-offset-4 hover:underline"
                        >
                          {a.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-muted-foreground">
                    Fabric is cut to your length and cannot be returned.
                  </p>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  )
}
