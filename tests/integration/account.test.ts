import type { MongoMemoryReplSet } from "mongodb-memory-server"
import mongoose from "mongoose"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { addressSchema } from "@/features/account/schemas"
import { NotFoundError, UnauthorizedError, ValidationError } from "@/lib/errors"
import type { Actor } from "@/lib/security/authorize"
import { Address } from "@/models/address"
import { AuditLog } from "@/models/audit-log"
import { Product } from "@/models/product"
import { User } from "@/models/user"
import { Wishlist } from "@/models/wishlist"
import * as account from "@/services/account-service"
import { resetDatabase, startDatabase, stopDatabase } from "./helpers"

let replSet: MongoMemoryReplSet
beforeAll(async () => {
  replSet = await startDatabase("account_test")
  await Promise.all([User.init(), Address.init(), Wishlist.init(), Product.init()])
}, 240_000)
afterAll(() => stopDatabase(replSet))
beforeEach(resetDatabase)

async function makeCustomer(email: string, name = "Customer"): Promise<Actor> {
  const user = await User.create({ email, name, emailVerified: new Date(), role: "customer" })
  return { id: user._id.toString(), role: "customer" }
}

const input = (over: Record<string, unknown> = {}) =>
  addressSchema.parse({
    fullName: "Meera Shah",
    phone: "9876543210",
    line1: "12 Ring Road",
    city: "Surat",
    state: "Gujarat",
    pincode: "395007",
    ...over,
  })

describe("profile", () => {
  it("updates the name, phone (stored as E.164) and marketing choice, and audits it", async () => {
    const me = await makeCustomer("a@example.com")
    await account.updateProfile(me, { name: "Meera S", phone: "9876543210", marketingEmail: true })
    const profile = await account.getProfile(me)
    expect(profile).toMatchObject({
      name: "Meera S",
      phone: "+919876543210",
      marketingEmail: true,
      email: "a@example.com",
      hasPassword: false,
      googleLinked: false,
      emailVerified: true,
    })
    expect(
      await AuditLog.countDocuments({ action: "account.profile_updated", entityId: me.id })
    ).toBe(1)
  })

  it("clears the phone when it is left blank, and cannot be used to change email, role or status", async () => {
    const me = await makeCustomer("a@example.com")
    await account.updateProfile(me, { name: "Meera", phone: "9876543210", marketingEmail: false })
    // Extra fields a hostile form might send are not part of the input type; even if forced in, they are ignored.
    await account.updateProfile(me, {
      name: "Meera",
      phone: undefined,
      marketingEmail: false,
      role: "super_admin",
      email: "evil@example.com",
      status: "suspended",
    } as never)
    const user = await User.findById(me.id)
    expect(user).toMatchObject({ email: "a@example.com", role: "customer", status: "active" })
    expect(user!.phone).toBeUndefined()
  })

  it("never exposes the password hash", async () => {
    const me = await makeCustomer("a@example.com")
    await User.updateOne({ _id: me.id }, { passwordHash: "$argon2id$secret" })
    expect(JSON.stringify(await account.getProfile(me))).not.toMatch(/argon2|passwordHash|secret/)
    expect(JSON.stringify((await User.findById(me.id))!.toJSON())).not.toMatch(
      /argon2|passwordHash/
    )
  })

  it("refuses a signed-out caller and a suspended account", async () => {
    await expect(account.getProfile(null as unknown as Actor)).rejects.toBeInstanceOf(
      UnauthorizedError
    )
    const me = await makeCustomer("a@example.com")
    await User.updateOne({ _id: me.id }, { status: "suspended" })
    await expect(account.getProfile(me)).rejects.toBeInstanceOf(NotFoundError)
    await expect(
      account.updateProfile(me, { name: "x", phone: undefined, marketingEmail: false })
    ).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe("address book", () => {
  it("makes the first address the default and lists the default first", async () => {
    const me = await makeCustomer("a@example.com")
    const first = await account.createAddress(me, input({ label: "Home" }))
    const second = await account.createAddress(me, input({ line1: "5 Mill Road", label: "Work" }))
    expect(first.isDefault).toBe(true)
    expect(second.isDefault).toBe(false)
    await account.createAddress(me, input({ line1: "9 New Road", makeDefault: true }))
    const list = await account.listAddresses(me)
    expect(list).toHaveLength(3)
    expect(list[0]).toMatchObject({ line1: "9 New Road", isDefault: true })
    expect(list.filter((a) => a.isDefault)).toHaveLength(1)
  })

  it("edits an address, including clearing optional fields, and can move the default", async () => {
    const me = await makeCustomer("a@example.com")
    const a = await account.createAddress(
      me,
      input({ label: "Home", landmark: "Near the temple", line2: "Flat 4" })
    )
    const b = await account.createAddress(me, input({ line1: "B road" }))
    await account.updateAddress(
      me,
      b.id,
      input({
        line1: "B road",
        city: "Vadodara",
        label: "",
        landmark: "",
        line2: "",
        makeDefault: true,
      })
    )
    const list = await account.listAddresses(me)
    expect(list.find((x) => x.id === b.id)).toMatchObject({ city: "Vadodara", isDefault: true })
    expect(list.find((x) => x.id === b.id)?.label).toBeUndefined()
    expect(list.find((x) => x.id === a.id)).toMatchObject({
      label: "Home",
      landmark: "Near the temple",
    })
  })

  it("promotes another address when the default is deleted, and clears it when none remain", async () => {
    const me = await makeCustomer("a@example.com")
    const a = await account.createAddress(me, input())
    const b = await account.createAddress(me, input({ line1: "B road" }))
    await account.deleteAddress(me, a.id)
    expect((await account.listAddresses(me)).map((x) => [x.id, x.isDefault])).toEqual([
      [b.id, true],
    ])
    await account.deleteAddress(me, b.id)
    expect(await account.listAddresses(me)).toEqual([])
    expect((await User.findById(me.id))!.defaultAddressId).toBeNull()
  })

  it("holds at most ten addresses, even under simultaneous requests", async () => {
    const me = await makeCustomer("a@example.com")
    const results = await Promise.allSettled(
      Array.from({ length: 16 }, (_, i) => account.createAddress(me, input({ line1: `${i} Road` })))
    )
    expect(await Address.countDocuments({ userId: me.id })).toBe(10) // exactly the first ten survive
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(10)
    expect(
      results
        .filter((r) => r.status === "rejected")
        .every((r) => (r as PromiseRejectedResult).reason instanceof ValidationError)
    ).toBe(true)
    await expect(account.createAddress(me, input())).rejects.toThrow("up to 10 addresses")
  })

  it("rejects invalid data at the database as well, not only in the form", async () => {
    const me = await makeCustomer("a@example.com")
    await expect(account.createAddress(me, { ...input(), pincode: "12" })).rejects.toThrow()
    await expect(
      account.createAddress(me, { ...input(), state: "Atlantis" as never })
    ).rejects.toThrow()
    await expect(account.createAddress(me, { ...input(), phone: "123" })).rejects.toThrow()
    expect(await Address.countDocuments()).toBe(0)
  })
})

describe("customer data isolation (IDOR)", () => {
  it("one customer can neither see nor change nor delete another's address, and the answer is just 'not found'", async () => {
    const alice = await makeCustomer("alice@example.com")
    const bob = await makeCustomer("bob@example.com")
    const secret = await account.createAddress(
      alice,
      input({ fullName: "Alice Private", line1: "1 Secret Lane" })
    )
    await account.createAddress(bob, input({ fullName: "Bob" }))

    expect((await account.listAddresses(bob)).map((a) => a.fullName)).toEqual(["Bob"])
    await expect(
      account.updateAddress(bob, secret.id, input({ fullName: "Hacked" }))
    ).rejects.toBeInstanceOf(NotFoundError)
    await expect(account.deleteAddress(bob, secret.id)).rejects.toBeInstanceOf(NotFoundError)
    await expect(account.setDefaultAddress(bob, secret.id)).rejects.toBeInstanceOf(NotFoundError)

    const untouched = await Address.findById(secret.id)
    expect(untouched).toMatchObject({ fullName: "Alice Private", line1: "1 Secret Lane" })
    expect((await User.findById(bob.id))!.defaultAddressId?.toString()).not.toBe(secret.id)
  })

  it("answers identically for someone else's id, a missing id and a malformed id", async () => {
    const alice = await makeCustomer("alice@example.com")
    const bob = await makeCustomer("bob@example.com")
    const theirs = await account.createAddress(alice, input())
    const errors = await Promise.all(
      [theirs.id, new mongoose.Types.ObjectId().toString(), "not-an-id", "{$ne:null}"].map((id) =>
        account.deleteAddress(bob, id).catch((e: Error) => `${e.name}:${e.message}`)
      )
    )
    expect(new Set(errors).size).toBe(1)
    expect(errors[0]).toMatch(/^NotFoundError/)
  })

  it("wishlists are private to their owner", async () => {
    const alice = await makeCustomer("alice@example.com")
    const bob = await makeCustomer("bob@example.com")
    await Product.create({ name: "Cotton", slug: "cotton", status: "active" })
    await account.setWishlistItem(alice, "cotton", true)
    expect(await account.getWishlistSlugs(alice)).toEqual(["cotton"])
    expect(await account.getWishlistSlugs(bob)).toEqual([])
    await account.setWishlistItem(bob, "cotton", false) // removing from his own empty list changes nothing of Alice's
    expect(await account.getWishlistSlugs(alice)).toEqual(["cotton"])
  })

  it("every service call needs a signed-in actor", async () => {
    const nobody = null as unknown as Actor
    await expect(account.listAddresses(nobody)).rejects.toBeInstanceOf(UnauthorizedError)
    await expect(account.createAddress(nobody, input())).rejects.toBeInstanceOf(UnauthorizedError)
    await expect(account.deleteAddress(nobody, "a".repeat(24))).rejects.toBeInstanceOf(
      UnauthorizedError
    )
    await expect(account.getWishlistSlugs(nobody)).rejects.toBeInstanceOf(UnauthorizedError)
    await expect(account.mergeWishlist(nobody, ["x"])).rejects.toBeInstanceOf(UnauthorizedError)
  })
})

describe("server-side wishlist", () => {
  const sell = (slug: string, status: "active" | "draft" | "archived" = "active") =>
    Product.create({ name: slug, slug, status })

  it("adds, removes, de-duplicates and lists newest first", async () => {
    const me = await makeCustomer("a@example.com")
    await Promise.all([sell("a-one"), sell("b-two"), sell("c-three")])
    await account.setWishlistItem(me, "a-one", true)
    await account.setWishlistItem(me, "b-two", true)
    await account.setWishlistItem(me, "a-one", true) // already there
    expect(await account.getWishlistSlugs(me)).toEqual(["b-two", "a-one"])
    await account.setWishlistItem(me, "b-two", false)
    expect(await account.getWishlistSlugs(me)).toEqual(["a-one"])
    await account.setWishlistItem(me, "c-three", false) // removing something never added is harmless
    expect(await Wishlist.countDocuments({ userId: me.id })).toBe(1)
  })

  it("only accepts products that are for sale and rejects malformed slugs", async () => {
    const me = await makeCustomer("a@example.com")
    await Promise.all([sell("live"), sell("hidden", "draft"), sell("gone", "archived")])
    await expect(account.setWishlistItem(me, "hidden", true)).rejects.toBeInstanceOf(NotFoundError)
    await expect(account.setWishlistItem(me, "gone", true)).rejects.toBeInstanceOf(NotFoundError)
    await expect(account.setWishlistItem(me, "nope", true)).rejects.toBeInstanceOf(NotFoundError)
    await expect(account.setWishlistItem(me, "../etc", true)).rejects.toBeInstanceOf(NotFoundError)
    await expect(
      account.setWishlistItem(me, { $ne: "" } as unknown as string, true)
    ).rejects.toBeInstanceOf(NotFoundError)
    await account.setWishlistItem(me, "live", true)
    await Product.updateOne({ slug: "live" }, { status: "archived" })
    expect(await account.getWishlistSlugs(me)).toEqual([]) // a product no longer sold quietly drops out
  })

  it("simultaneous adds of the same product leave one entry", async () => {
    const me = await makeCustomer("a@example.com")
    await sell("popular")
    await Promise.all(
      Array.from({ length: 10 }, () => account.setWishlistItem(me, "popular", true))
    )
    expect((await Wishlist.findOne({ userId: me.id }))!.items).toHaveLength(1)
  })

  it("merges a guest wishlist after sign-in: keeps existing items, adds new ones, ignores bad ones", async () => {
    const me = await makeCustomer("a@example.com")
    await Promise.all([sell("a-one"), sell("b-two"), sell("c-three"), sell("hidden", "draft")])
    await account.setWishlistItem(me, "a-one", true)
    const merged = await account.mergeWishlist(me, [
      "c-three",
      "a-one",
      "b-two",
      "hidden",
      "does-not-exist",
      "Bad Slug",
      "c-three",
    ])
    expect(new Set(merged)).toEqual(new Set(["a-one", "b-two", "c-three"]))
    expect(merged).toHaveLength(3)
    expect(merged[0]).toBe("c-three") // the visitor's most recent save comes first
    expect(await account.mergeWishlist(me, [])).toEqual(merged) // nothing to merge: unchanged
  })
})
