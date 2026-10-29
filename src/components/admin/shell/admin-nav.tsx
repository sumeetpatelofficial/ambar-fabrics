"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ArrowRightLeft,
  Palette,
  Scissors,
  BarChart3,
  Boxes,
  FileText,
  FolderOpen,
  Layers,
  LayoutDashboard,
  Package,
  ScrollText,
  Settings,
  Shirt,
  Star,
  Ticket,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react"
import { cn } from "cn"

const ICONS: Record<string, LucideIcon> = {
  "/admin": LayoutDashboard,
  "/admin/orders": Package,
  "/admin/products": Shirt,
  "/admin/categories": Layers,
  "/admin/collections": FolderOpen,
  "/admin/fabrics": Scissors,
  "/admin/prints": Palette,
  "/admin/inventory": Boxes,
  "/admin/reports": BarChart3,
  "/admin/reviews": Star,
  "/admin/pages": FileText,
  "/admin/redirects": ArrowRightLeft,
  "/admin/coupons": Ticket,
  "/admin/customers": Users,
  "/admin/staff": UserCog,
  "/admin/settings": Settings,
  "/admin/audit": ScrollText,
}

const GROUPS: { heading: string; hrefs: string[] }[] = [
  { heading: "", hrefs: ["/admin"] },
  {
    heading: "Shop",
    hrefs: [
      "/admin/orders",
      "/admin/products",
      "/admin/categories",
      "/admin/collections",
      "/admin/fabrics",
      "/admin/prints",
      "/admin/inventory",
      "/admin/reviews",
      "/admin/reports",
    ],
  },
  {
    heading: "Marketing and content",
    hrefs: ["/admin/coupons", "/admin/pages", "/admin/redirects"],
  },
  {
    heading: "People and settings",
    hrefs: ["/admin/customers", "/admin/staff", "/admin/settings", "/admin/audit"],
  },
]

export type NavItem = { href: string; label: string; badge?: number }

/** The admin menu: only the entries the signed-in role may open, grouped, with the current one marked. */
export function AdminNav({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname()
  const byHref = new Map(items.map((i) => [i.href, i]))
  const current = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`)
  return (
    <nav aria-label="Admin" className="flex flex-col gap-5">
      {GROUPS.map((g) => {
        const visible = g.hrefs.map((h) => byHref.get(h)).filter((x): x is NavItem => Boolean(x))
        if (visible.length === 0) return null
        return (
          <div key={g.heading || "top"} className="flex flex-col gap-1">
            {g.heading ? (
              <p className="px-3 pb-1 text-xs text-muted-foreground">{g.heading}</p>
            ) : null}
            <ul className="flex flex-col gap-0.5">
              {visible.map((item) => {
                const Icon = ICONS[item.href] ?? LayoutDashboard
                const active = current(item.href)
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex min-h-10 items-center gap-3 rounded-lg px-3 text-[0.95rem] transition-colors",
                        active
                          ? "bg-primary/10 font-medium text-primary"
                          : "text-foreground/80 hover:bg-muted"
                      )}
                    >
                      <Icon
                        aria-hidden="true"
                        className="size-[1.15rem] shrink-0"
                        strokeWidth={1.75}
                      />
                      <span className="flex-1">{item.label}</span>
                      {item.badge ? (
                        <span className="tabular min-w-5 rounded-full bg-primary px-1.5 text-center text-xs leading-5 text-primary-foreground">
                          {item.badge}
                          <span className="sr-only"> waiting</span>
                        </span>
                      ) : null}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </nav>
  )
}
