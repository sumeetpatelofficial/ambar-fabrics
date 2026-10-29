/**
 * Roles and what each may do. This table is the single source of truth: every protected operation calls
 * `assertPermission` (lib/security/authorize.ts), and tests assert the whole matrix. See docs/security.md §3.
 */
export const ROLES = [
  "customer",
  "support",
  "catalog_manager",
  "fulfillment_manager",
  "admin",
  "super_admin",
] as const
export type Role = (typeof ROLES)[number]

export const STAFF_ROLES: readonly Role[] = [
  "support",
  "catalog_manager",
  "fulfillment_manager",
  "admin",
  "super_admin",
]

export const PERMISSIONS = [
  "catalog:read",
  "catalog:write",
  "inventory:read",
  "inventory:adjust",
  "orders:read",
  "orders:update",
  "orders:cancel",
  /** Record a sale made over the counter in the shop. */
  "orders:create_offline",
  "shipments:manage",
  "returns:manage",
  "refunds:create",
  "refunds:approve_large",
  "payments:read",
  "customers:read",
  "customers:suspend",
  "coupons:manage",
  "reviews:moderate",
  "content:write",
  "analytics:read",
  /** What the shop paid for things, and the profit worked out from it. Kept to owners and admins. */
  "costs:read",
  "settings:write",
  "users:manage_roles",
  "auditlogs:read",
] as const
export type Permission = (typeof PERMISSIONS)[number]

const ALL_OPERATIONS = PERMISSIONS.filter(
  (p) => p !== "refunds:approve_large" && p !== "users:manage_roles"
)

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  customer: [],
  support: [
    "catalog:read",
    "inventory:read",
    "orders:read",
    "orders:update", // internal notes only; the order service narrows this further in Phase 7
    "orders:cancel",
    "returns:manage",
    "customers:read",
    "reviews:moderate",
  ],
  catalog_manager: [
    "catalog:read",
    "catalog:write",
    "inventory:read",
    "inventory:adjust",
    "content:write",
  ],
  fulfillment_manager: [
    "catalog:read",
    "inventory:read",
    "inventory:adjust",
    "orders:read",
    "orders:update",
    "orders:cancel",
    "shipments:manage",
    "returns:manage",
    "analytics:read", // operational reports only; finance views are narrowed in Phase 11
  ],
  admin: ALL_OPERATIONS,
  super_admin: PERMISSIONS,
}

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission)
}

export function isStaff(role: Role): boolean {
  return STAFF_ROLES.includes(role)
}

/** Position in the hierarchy, used so nobody can grant a role above their own. */
export const ROLE_RANK: Record<Role, number> = {
  customer: 0,
  support: 1,
  catalog_manager: 1,
  fulfillment_manager: 1,
  admin: 2,
  super_admin: 3,
}
