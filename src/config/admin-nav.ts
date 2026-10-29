import type { Permission } from "@/config/permissions"

/** Every admin section and the permission needed to open it. The pages, the menu and the tests all read this. */
export const ADMIN_SECTIONS = [
  { href: "/admin", label: "Overview", permission: null },
  { href: "/admin/orders", label: "Orders", permission: "orders:read" },
  { href: "/admin/products", label: "Products", permission: "catalog:read" },
  { href: "/admin/categories", label: "Categories", permission: "catalog:read" },
  { href: "/admin/collections", label: "Collections", permission: "catalog:read" },
  { href: "/admin/fabrics", label: "Fabrics", permission: "catalog:read" },
  { href: "/admin/prints", label: "Prints", permission: "catalog:read" },
  { href: "/admin/inventory", label: "Inventory", permission: "inventory:read" },
  { href: "/admin/reviews", label: "Reviews", permission: "reviews:moderate" },
  { href: "/admin/reports", label: "Reports", permission: "analytics:read" },
  { href: "/admin/pages", label: "Pages", permission: "content:write" },
  { href: "/admin/redirects", label: "Redirects", permission: "content:write" },
  { href: "/admin/coupons", label: "Coupons", permission: "coupons:manage" },
  { href: "/admin/customers", label: "Customers", permission: "customers:read" },
  { href: "/admin/staff", label: "Staff and roles", permission: "users:manage_roles" },
  { href: "/admin/settings", label: "Settings", permission: "settings:write" },
  { href: "/admin/audit", label: "Audit log", permission: "auditlogs:read" },
] as const satisfies readonly { href: string; label: string; permission: Permission | null }[]

export type AdminHref = (typeof ADMIN_SECTIONS)[number]["href"]

export function permissionFor(href: AdminHref): Permission | undefined {
  return ADMIN_SECTIONS.find((s) => s.href === href)?.permission ?? undefined
}
