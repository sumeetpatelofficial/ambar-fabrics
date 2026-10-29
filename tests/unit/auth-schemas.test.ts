import { describe, expect, it } from "vitest"
import { addressSchema, profileSchema } from "@/features/account/schemas"
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  resetSchema,
  safeNextPath,
} from "@/features/auth/schemas"
import { normalizeIndianMobile, toE164 } from "@/lib/phone"

describe("safeNextPath (no open redirects)", () => {
  it.each(["/account/orders", "/products/handloom-cotton", "/account/addresses?x=1"])(
    "allows %s",
    (p) => {
      expect(safeNextPath(p)).toBe(p)
    }
  )

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "evil.example",
    "",
    null,
    undefined,
    "/login",
    "/register?x",
    "/api/auth/signout",
    "/a\nb",
  ])("falls back for %j", (p) => {
    expect(safeNextPath(p as string | null | undefined)).toBe("/account")
  })

  it("uses the given fallback", () => {
    expect(safeNextPath("https://evil.example", "/")).toBe("/")
  })
})

describe("auth schemas", () => {
  it("normalises email case and whitespace", () => {
    expect(
      registerSchema.parse({
        name: " Meera ",
        email: "  Meera@Example.COM ",
        password: "a long enough one",
      })
    ).toEqual({ name: "Meera", email: "meera@example.com", password: "a long enough one" })
  })

  it.each([
    ["", "a long enough one"],
    ["not-an-email", "a long enough one"],
    ["a@b", "a long enough one"],
    ["a@example.com", "short"],
  ])("rejects %j / %j", (email, password) => {
    expect(registerSchema.safeParse({ name: "M", email, password }).success).toBe(false)
  })

  it("login does not reveal the password rules (any non-empty value passes the shape check)", () => {
    expect(loginSchema.safeParse({ email: "a@example.com", password: "x" }).success).toBe(true)
    expect(loginSchema.safeParse({ email: "a@example.com", password: "" }).success).toBe(false)
  })

  it("reset and change enforce the length rules, and tokens must look like tokens", () => {
    expect(resetSchema.safeParse({ token: "short", password: "a long enough one" }).success).toBe(
      false
    )
    expect(resetSchema.safeParse({ token: "x".repeat(43), password: "short" }).success).toBe(false)
    expect(
      changePasswordSchema.safeParse({ currentPassword: "old", newPassword: "short" }).success
    ).toBe(false)
    expect(
      changePasswordSchema.safeParse({ currentPassword: "old", newPassword: "a long enough one" })
        .success
    ).toBe(true)
  })
})

describe("Indian mobile numbers", () => {
  it.each([
    ["98765 43210", "9876543210"],
    ["+91 98765-43210", "9876543210"],
    ["09876543210", "9876543210"],
    ["(91) 8765432109", "8765432109"],
    ["919876543210", "9876543210"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeIndianMobile(input)).toBe(expected)
  })

  it.each(["12345 67890", "98765", "98765432101", "abcdefghij", "", "+1 415 555 0100"])(
    "rejects %j",
    (input) => {
      expect(normalizeIndianMobile(input)).toBeNull()
    }
  )

  it("formats to E.164", () => {
    expect(toE164("9876543210")).toBe("+919876543210")
  })
})

describe("profile and address schemas", () => {
  const address = {
    fullName: "Meera Shah",
    phone: "98765 43210",
    line1: "12 Ring Road",
    city: "Surat",
    state: "Gujarat",
    pincode: "395007",
  }

  it("accepts a valid address, normalises the phone and treats blank optionals as absent", () => {
    expect(
      addressSchema.parse({
        ...address,
        line2: "  ",
        landmark: "",
        label: "Home",
        makeDefault: "on",
      })
    ).toEqual({
      ...address,
      phone: "9876543210",
      label: "Home",
      line2: undefined,
      landmark: undefined,
      makeDefault: true,
    })
  })

  it.each([
    [{ pincode: "012345" }, "pincode"],
    [{ pincode: "39500" }, "pincode"],
    [{ phone: "12345" }, "phone"],
    [{ state: "Atlantis" }, "state"],
    [{ fullName: "" }, "fullName"],
    [{ line1: "x".repeat(121) }, "line1"],
    [{ city: "" }, "city"],
  ])("rejects %j", (patch, field) => {
    const result = addressSchema.safeParse({ ...address, ...patch })
    expect(result.success).toBe(false)
    expect(!result.success && result.error.issues[0]?.path[0]).toBe(field)
  })

  it("strips fields a customer must never set (role, email, status)", () => {
    const parsed = profileSchema.parse({
      name: "Meera",
      phone: "",
      marketingEmail: "on",
      role: "super_admin",
      email: "x@y.com",
      status: "active",
      emailVerified: true,
    })
    expect(Object.keys(parsed).sort()).toEqual(["marketingEmail", "name", "phone"])
    expect(parsed.marketingEmail).toBe(true)
    expect(parsed.phone).toBeUndefined()
  })
})
