"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { Bell, ExternalLink, Menu } from "lucide-react"
import { AdminBrand } from "@/components/admin/shell/admin-brand"
import { AdminNav, type NavItem } from "@/components/admin/shell/admin-nav"
import { UserCard } from "@/components/admin/shell/user-card"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"

export type Waiting = { label: string; count: number; href: string }[]

/** The bar across the top of every admin page: menu on phones, where you are, what is waiting, the shop link. */
export function AdminTopbar({
  items,
  waiting,
  user,
}: {
  items: NavItem[]
  waiting: Waiting
  user: { name: string; role: string }
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const here = [...items]
    .sort((a, b) => b.href.length - a.href.length)
    .find((i) => (i.href === "/admin" ? pathname === "/admin" : pathname.startsWith(i.href)))
  const total = waiting.reduce((n, w) => n + w.count, 0)
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur sm:px-6 print:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Open the admin menu"
            />
          }
        >
          <Menu aria-hidden="true" className="size-5" />
        </SheetTrigger>
        <SheetContent side="left" className="w-[85%] max-w-xs gap-0">
          <SheetHeader className="border-b p-4">
            <SheetTitle className="font-sans text-base font-normal">
              <AdminBrand />
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4">
            <AdminNav items={items} onNavigate={() => setOpen(false)} />
          </div>
          <div className="border-t p-4">
            <UserCard name={user.name} role={user.role} />
          </div>
        </SheetContent>
      </Sheet>
      <p className="text-lg font-medium">{here?.label ?? "Admin"}</p>
      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <Link
          href="/"
          target="_blank"
          rel="noopener"
          className="hidden min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground sm:inline-flex"
        >
          View shop
          <ExternalLink aria-hidden="true" className="size-3.5" />
          <span className="sr-only">(opens in a new tab)</span>
        </Link>
        <details className="group relative">
          <summary
            className="relative flex size-10 cursor-pointer list-none items-center justify-center rounded-full hover:bg-muted [&::-webkit-details-marker]:hidden"
            aria-label={
              total
                ? `${total} ${total === 1 ? "thing needs" : "things need"} attention`
                : "Nothing needs attention"
            }
          >
            <Bell aria-hidden="true" className="size-5" />
            {total ? (
              <span
                aria-hidden="true"
                className="absolute top-2 right-2 size-2 rounded-full bg-madder"
              />
            ) : null}
          </summary>
          <div className="absolute right-0 z-40 mt-2 w-64 rounded-lg border bg-background p-3 text-sm shadow-md">
            <p className="mb-2 font-medium">Needs your attention</p>
            {waiting.filter((w) => w.count > 0).length === 0 ? (
              <p className="text-muted-foreground">All caught up.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {waiting
                  .filter((w) => w.count > 0)
                  .map((w) => (
                    <li key={w.label}>
                      <Link
                        href={w.href}
                        className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-muted"
                      >
                        {w.label}
                        <span className="tabular rounded-full bg-madder/10 px-2 text-madder">
                          {w.count}
                        </span>
                      </Link>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </details>
        <span
          className="ml-1 hidden size-9 items-center justify-center rounded-full bg-primary text-sm text-primary-foreground sm:flex"
          aria-hidden="true"
        >
          {user.name.trim().charAt(0).toUpperCase() || "A"}
        </span>
      </div>
    </header>
  )
}
