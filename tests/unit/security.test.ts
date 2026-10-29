import { describe, expect, it } from "vitest"
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLE_RANK,
  ROLES,
  roleHasPermission,
  isStaff,
  type Permission,
  type Role,
} from "@/config/permissions"
import { ForbiddenError, NotFoundError, UnauthorizedError } from "@/lib/errors"
import {
  assertCanGrant,
  assertOwnership,
  assertPermission,
  assertSignedIn,
  assertStaff,
  type Actor,
} from "@/lib/security/authorize"
import { checkPassword, PASSWORD_MAX, PASSWORD_MIN } from "@/lib/security/password-policy"
import { burnPasswordCheck, hashPassword, verifyPassword } from "@/lib/security/password"
import { generateToken, hashToken, safeEqual } from "@/lib/security/tokens"

const actor = (role: Role, id = "a".repeat(24)): Actor => ({ id, role })

describe("checkPassword", () => {
  it("accepts a long, unremarkable password with no symbol rules", () => {
    expect(checkPassword("correct horse battery staple")).toBeNull()
    expect(checkPassword("tenletters1")).toBeNull()
  })

  it("enforces length both ways", () => {
    expect(checkPassword("a".repeat(PASSWORD_MIN - 1))).toBe("too_short")
    expect(checkPassword("xK9".repeat(50))).toBe("too_long")
    expect(checkPassword("p".repeat(PASSWORD_MAX) + "q")).toBe("too_long")
  })

  it.each([
    "password123",
    "Password123",
    "QWERTYUIOP",
    "qwerty-12345",
    "1234567890",
    "iloveyou123",
    "AmbarFabrics",
  ])("rejects the common password %s", (p) => {
    expect(checkPassword(p)).toBe("common")
  })

  it("rejects repetition and simple sequences", () => {
    expect(checkPassword("aaaaaaaaaaaa")).toBe("repetitive")
    expect(checkPassword("ababababab")).toBe("repetitive")
    expect(checkPassword("abcdefghijk")).toBe("repetitive")
  })

  it("rejects passwords containing the visitor's email name or first name", () => {
    expect(checkPassword("meera.shah-2026!", { email: "meera.shah@example.com" })).toBe(
      "contains_email"
    )
    expect(checkPassword("Sumeet-loves-cloth", { name: "Sumeet Patel" })).toBe("contains_name")
    expect(
      checkPassword("totally-unrelated-phrase", {
        email: "meera.shah@example.com",
        name: "Meera Shah",
      })
    ).toBeNull()
  })

  it("ignores very short personal fragments that would reject innocent passwords", () => {
    expect(
      checkPassword("an-ordinary-long-phrase", { email: "al@example.com", name: "Al" })
    ).toBeNull()
  })
})

describe("password hashing", () => {
  it("produces an Argon2id hash that verifies, with a different salt every time", async () => {
    const [a, b] = await Promise.all([
      hashPassword("a good long passphrase"),
      hashPassword("a good long passphrase"),
    ])
    expect(a).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/)
    expect(a).not.toBe(b)
    expect(await verifyPassword(a, "a good long passphrase")).toBe(true)
    expect(await verifyPassword(a, "a good long passphrasE")).toBe(false)
  })

  it("never treats a malformed hash as a match, and never throws", async () => {
    for (const bad of ["", "not-a-hash", "$argon2id$garbage", "x".repeat(500)])
      expect(await verifyPassword(bad, "anything")).toBe(false)
  })

  it("burnPasswordCheck takes real hashing time so unknown accounts cannot be told apart by speed", async () => {
    await burnPasswordCheck("warm up the lazy dummy hash")
    const started = performance.now()
    await burnPasswordCheck("anything at all")
    expect(performance.now() - started).toBeGreaterThan(5)
  })
})

describe("tokens", () => {
  it("are long, URL-safe and unique", () => {
    const tokens = new Set(Array.from({ length: 200 }, generateToken))
    expect(tokens.size).toBe(200)
    for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it("are stored only as a one-way hash", () => {
    const token = generateToken()
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashToken(token)).not.toContain(token)
    expect(hashToken(token)).toBe(hashToken(token))
    expect(hashToken(token)).not.toBe(hashToken(generateToken()))
  })

  it("compares in constant time, including different lengths", () => {
    expect(safeEqual("abc", "abc")).toBe(true)
    expect(safeEqual("abc", "abd")).toBe(false)
    expect(safeEqual("abc", "abcd")).toBe(false)
    expect(safeEqual("", "")).toBe(true)
  })
})

describe("permission matrix", () => {
  const has = (role: Role) => PERMISSIONS.filter((p) => roleHasPermission(role, p))

  it("gives customers no staff permissions", () => {
    expect(has("customer")).toEqual([])
    expect(isStaff("customer")).toBe(false)
  })

  it("gives super administrators everything and administrators everything except role management and large refunds", () => {
    expect(has("super_admin")).toEqual([...PERMISSIONS])
    expect(PERMISSIONS.filter((p) => !roleHasPermission("admin", p))).toEqual([
      "refunds:approve_large",
      "users:manage_roles",
    ])
  })

  it("only super administrators manage roles or approve large refunds", () => {
    for (const role of ROLES) {
      const expected = role === "super_admin"
      expect(roleHasPermission(role, "users:manage_roles")).toBe(expected)
      expect(roleHasPermission(role, "refunds:approve_large")).toBe(expected)
    }
  })

  it("keeps each staff role inside its job", () => {
    expect(roleHasPermission("catalog_manager", "catalog:write")).toBe(true)
    expect(roleHasPermission("catalog_manager", "orders:read")).toBe(false)
    expect(roleHasPermission("catalog_manager", "refunds:create")).toBe(false)
    expect(roleHasPermission("fulfillment_manager", "shipments:manage")).toBe(true)
    expect(roleHasPermission("fulfillment_manager", "catalog:write")).toBe(false)
    expect(roleHasPermission("fulfillment_manager", "settings:write")).toBe(false)
    expect(roleHasPermission("support", "customers:read")).toBe(true)
    expect(roleHasPermission("support", "refunds:create")).toBe(false)
    expect(roleHasPermission("support", "settings:write")).toBe(false)
    expect(roleHasPermission("support", "payments:read")).toBe(false)
  })

  it("only owners and admins may record a sale made in the shop", () => {
    for (const r of ROLES)
      expect(roleHasPermission(r, "orders:create_offline"), r).toBe(
        r === "admin" || r === "super_admin"
      )
  })

  it("matches the documented matrix exactly (a change here must be deliberate)", () => {
    const snapshot = Object.fromEntries(ROLES.map((r) => [r, [...ROLE_PERMISSIONS[r]].sort()]))
    expect(snapshot.support).toEqual([
      "catalog:read",
      "customers:read",
      "inventory:read",
      "orders:cancel",
      "orders:read",
      "orders:update",
      "returns:manage",
      "reviews:moderate",
    ])
    expect(snapshot.catalog_manager).toEqual([
      "catalog:read",
      "catalog:write",
      "content:write",
      "inventory:adjust",
      "inventory:read",
    ])
    expect(snapshot.fulfillment_manager).toEqual([
      "analytics:read",
      "catalog:read",
      "inventory:adjust",
      "inventory:read",
      "orders:cancel",
      "orders:read",
      "orders:update",
      "returns:manage",
      "shipments:manage",
    ])
  })

  it("every permission is granted to at least one role, and roles are ranked", () => {
    for (const p of PERMISSIONS as readonly Permission[])
      expect(
        ROLES.some((r) => roleHasPermission(r, p)),
        p
      ).toBe(true)
    expect(ROLE_RANK.super_admin).toBeGreaterThan(ROLE_RANK.admin)
    expect(ROLE_RANK.admin).toBeGreaterThan(ROLE_RANK.support)
    expect(ROLE_RANK.support).toBeGreaterThan(ROLE_RANK.customer)
  })
})

describe("authorization helpers", () => {
  it("rejects anonymous callers with 401 and wrong roles with 403", () => {
    expect(() => assertSignedIn(null)).toThrow(UnauthorizedError)
    expect(() => assertPermission(undefined, "orders:read")).toThrow(UnauthorizedError)
    expect(() => assertPermission(actor("customer"), "orders:read")).toThrow(ForbiddenError)
    expect(() => assertPermission(actor("support"), "orders:read")).not.toThrow()
    expect(() => assertStaff(actor("customer"))).toThrow(ForbiddenError)
    expect(() => assertStaff(actor("support"))).not.toThrow()
  })

  it("treats someone else's record as not found, never as forbidden", () => {
    const me = actor("customer", "a".repeat(24))
    expect(() => assertOwnership(me, "a".repeat(24))).not.toThrow()
    expect(() => assertOwnership(me, "b".repeat(24))).toThrow(NotFoundError)
    expect(() => assertOwnership(me, null)).toThrow(NotFoundError)
    expect(() => assertOwnership(me, undefined)).toThrow(NotFoundError)
  })

  it("stops anyone granting a role above their own", () => {
    expect(() => assertCanGrant(actor("admin"), "super_admin")).toThrow(ForbiddenError)
    expect(() => assertCanGrant(actor("admin"), "support")).not.toThrow()
    expect(() => assertCanGrant(actor("admin"), "admin")).not.toThrow()
    expect(() => assertCanGrant(actor("support"), "admin")).toThrow(ForbiddenError)
    expect(() => assertCanGrant(actor("super_admin"), "super_admin")).not.toThrow()
  })
})
