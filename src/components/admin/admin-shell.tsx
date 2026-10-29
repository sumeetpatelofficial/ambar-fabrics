import type { ReactNode } from "react"
import { AdminBrand } from "@/components/admin/shell/admin-brand"
import { AdminNav, type NavItem } from "@/components/admin/shell/admin-nav"
import { AdminTopbar } from "@/components/admin/shell/admin-topbar"
import { UserCard } from "@/components/admin/shell/user-card"
import { ADMIN_SECTIONS } from "@/config/admin-nav"
import { roleHasPermission } from "@/config/permissions"
import { requireStaffPage, toActor } from "@/lib/auth/session"
import { Sparkline } from "@/components/admin/charts/sparkline"
import { formatPaise } from "@/lib/money"
import { getAttention, getMonthGlance } from "@/services/admin-dashboard-service"

/**
 * The admin frame: its own sidebar and top bar, nothing from the shop. The menu shows only what this
 * person's role may open; each page and service checks again.
 */
export async function AdminShell({ children }: { children: ReactNode }) {
  const user = await requireStaffPage()
  const attention = await getAttention(toActor(user))
  const glance = await getMonthGlance(toActor(user))
  const badge: Record<string, number | undefined> = {
    "/admin/orders": (attention.toShip ?? 0) + (attention.needsAttention ?? 0) || undefined,
    "/admin/reviews": attention.reviews || undefined,
  }
  const items: NavItem[] = ADMIN_SECTIONS.filter(
    (s) => !s.permission || roleHasPermission(user.role, s.permission)
  ).map((s) => ({
    href: s.href,
    label: s.label,
    badge: badge[s.href],
  }))
  const waiting = [
    { label: "Orders to ship", count: attention.toShip ?? 0, href: "/admin/orders?show=to_ship" },
    {
      label: "Returns to handle",
      count: attention.returns ?? 0,
      href: "/admin/orders?show=returns",
    },
    { label: "Orders needing a look", count: attention.needsAttention ?? 0, href: "/admin/orders" },
    { label: "Reviews to read", count: attention.reviews ?? 0, href: "/admin/reviews" },
  ]
  return (
    <div className="admin-root min-h-dvh bg-muted lg:grid lg:grid-cols-[16.5rem_1fr] print:block print:bg-white">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r bg-background p-4 lg:flex print:hidden">
        <div className="px-2 pt-1">
          <AdminBrand />
        </div>
        <div className="flex-1 overflow-y-auto">
          <AdminNav items={items} />
        </div>
        {glance ? (
          <div className="rounded-xl border p-3">
            <p className="text-xs text-muted-foreground">Sales this month</p>
            <p className="tabular text-xl">{formatPaise(glance.monthPaise)}</p>
            <Sparkline values={glance.trend} />
          </div>
        ) : null}
        <UserCard name={user.name} role={user.role} />
      </aside>
      <div className="flex min-w-0 flex-col">
        <AdminTopbar items={items} waiting={waiting} user={{ name: user.name, role: user.role }} />
        <main id="main" className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  )
}
