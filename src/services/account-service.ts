import "server-only"
import mongoose from "mongoose"
import { connectDb } from "@/lib/db/mongoose"
import { NotFoundError, ValidationError } from "@/lib/errors"
import { toE164 } from "@/lib/phone"
import { assertOwnership, assertSignedIn, type Actor } from "@/lib/security/authorize"
import type { AddressInput, ProfileInput } from "@/features/account/schemas"
import { MAX_ADDRESSES_PER_USER } from "@/config/addresses"
import { Address, type AddressDoc } from "@/models/address"
import { Product } from "@/models/product"
import { User } from "@/models/user"
import { Wishlist, WISHLIST_MAX_ITEMS } from "@/models/wishlist"
import { recordAudit, type AuditContext } from "@/services/audit-service"

/**
 * A customer's own data. Every function takes the signed-in `actor` and scopes every query by their id,
 * so one customer can never read or change another's records, whatever ids a request contains. A record
 * that is not theirs looks exactly like one that does not exist (404).
 */

// ------------------------------------------------------------------ profile

export type ProfileDTO = {
  id: string
  email: string
  name: string
  phone?: string
  marketingEmail: boolean
  emailVerified: boolean
  hasPassword: boolean
  googleLinked: boolean
}

export async function getProfile(actor: Actor): Promise<ProfileDTO> {
  assertSignedIn(actor)
  await connectDb()
  const user = await User.findById(actor.id).select("+passwordHash")
  if (!user || user.status !== "active") throw new NotFoundError()
  const { AuthAccount } = await import("@/models/auth-account")
  const google = await AuthAccount.exists({ userId: user._id, provider: "google" })
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    ...(user.phone ? { phone: user.phone } : {}),
    marketingEmail: Boolean(user.marketingConsent?.email),
    emailVerified: Boolean(user.emailVerified),
    hasPassword: Boolean(user.passwordHash),
    googleLinked: Boolean(google),
  }
}

export async function updateProfile(
  actor: Actor,
  input: ProfileInput,
  ctx: AuditContext = {}
): Promise<void> {
  assertSignedIn(actor)
  await connectDb()
  // `email`, `role`, `status` and the rest are not in the input type and cannot be set here.
  const set: Record<string, unknown> = {
    name: input.name,
    "marketingConsent.email": input.marketingEmail,
    "marketingConsent.at": new Date(),
  }
  const unset: Record<string, 1> = {}
  if (input.phone) set.phone = toE164(input.phone)
  else unset.phone = 1
  const result = await User.updateOne(
    { _id: actor.id, status: "active" },
    { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
    { runValidators: true }
  )
  if (result.matchedCount === 0) throw new NotFoundError()
  await recordAudit({
    action: "account.profile_updated",
    actor,
    entityType: "user",
    entityId: actor.id,
    context: ctx,
  })
}

// ------------------------------------------------------------------ addresses

export type AddressDTO = Omit<AddressInput, "makeDefault" | "label" | "line2" | "landmark"> & {
  id: string
  label?: string
  line2?: string
  landmark?: string
  isDefault: boolean
}

function toAddressDTO(a: AddressDoc, defaultId?: string | null): AddressDTO {
  return {
    id: a._id.toString(),
    ...(a.label ? { label: a.label } : {}),
    fullName: a.fullName,
    phone: a.phone,
    line1: a.line1,
    ...(a.line2 ? { line2: a.line2 } : {}),
    ...(a.landmark ? { landmark: a.landmark } : {}),
    city: a.city,
    state: a.state,
    pincode: a.pincode,
    isDefault: defaultId === a._id.toString(),
  }
}

export async function listAddresses(actor: Actor): Promise<AddressDTO[]> {
  assertSignedIn(actor)
  await connectDb()
  const [user, addresses] = await Promise.all([
    User.findById(actor.id).select({ defaultAddressId: 1 }).lean(),
    Address.find({ userId: actor.id }).sort({ createdAt: 1 }).lean<AddressDoc[]>(),
  ])
  const defaultId = user?.defaultAddressId?.toString() ?? null
  // The default address is always listed first.
  return addresses
    .map((a) => toAddressDTO(a, defaultId))
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
}

export async function createAddress(
  actor: Actor,
  input: AddressInput,
  ctx: AuditContext = {}
): Promise<AddressDTO> {
  assertSignedIn(actor)
  await connectDb()
  const { makeDefault, ...fields } = input
  const created = await Address.create({ ...fields, userId: actor.id })
  // Check after inserting, by rank: this address survives only if it is among the first ten (by id).
  // Simultaneous requests therefore cannot all slip past a limit checked beforehand, and the over-limit
  // ones are exactly the latest, not every request that happened to see too many.
  const rank = await Address.countDocuments({
    userId: actor.id,
    _id: mongoose.trusted({ $lte: created._id }),
  })
  if (rank > MAX_ADDRESSES_PER_USER) {
    await Address.deleteOne({ _id: created._id, userId: actor.id })
    throw new ValidationError(
      `You can save up to ${MAX_ADDRESSES_PER_USER} addresses. Remove one to add another.`
    )
  }
  const user = await User.findById(actor.id).select({ defaultAddressId: 1 })
  if (makeDefault || !user?.defaultAddressId)
    await User.updateOne({ _id: actor.id }, { $set: { defaultAddressId: created._id } })
  await recordAudit({
    action: "account.address_added",
    actor,
    entityType: "address",
    entityId: created._id.toString(),
    context: ctx,
  })
  const isDefault = Boolean(makeDefault || !user?.defaultAddressId)
  return toAddressDTO(created.toObject(), isDefault ? created._id.toString() : null)
}

export async function updateAddress(
  actor: Actor,
  addressId: string,
  input: AddressInput,
  ctx: AuditContext = {}
): Promise<void> {
  assertSignedIn(actor)
  if (!mongoose.isValidObjectId(addressId)) throw new NotFoundError()
  await connectDb()
  const { makeDefault, ...fields } = input
  // The owner is part of the filter: someone else's id matches nothing, exactly like an id that does not exist.
  const updated = await Address.findOneAndUpdate(
    { _id: addressId, userId: actor.id },
    {
      $set: { ...fields },
      $unset: {
        ...(fields.label ? {} : { label: 1 }),
        ...(fields.line2 ? {} : { line2: 1 }),
        ...(fields.landmark ? {} : { landmark: 1 }),
      },
    },
    { returnDocument: "after", runValidators: true }
  )
  if (!updated) throw new NotFoundError()
  if (makeDefault)
    await User.updateOne({ _id: actor.id }, { $set: { defaultAddressId: updated._id } })
  await recordAudit({
    action: "account.address_updated",
    actor,
    entityType: "address",
    entityId: addressId,
    context: ctx,
  })
}

export async function deleteAddress(
  actor: Actor,
  addressId: string,
  ctx: AuditContext = {}
): Promise<void> {
  assertSignedIn(actor)
  if (!mongoose.isValidObjectId(addressId)) throw new NotFoundError()
  await connectDb()
  const deleted = await Address.findOneAndDelete({ _id: addressId, userId: actor.id })
  if (!deleted) throw new NotFoundError()
  const user = await User.findById(actor.id).select({ defaultAddressId: 1 })
  if (user?.defaultAddressId?.toString() === addressId) {
    const next = await Address.findOne({ userId: actor.id })
      .sort({ createdAt: -1 })
      .select({ _id: 1 })
      .lean()
    await User.updateOne({ _id: actor.id }, { $set: { defaultAddressId: next?._id ?? null } })
  }
  await recordAudit({
    action: "account.address_deleted",
    actor,
    entityType: "address",
    entityId: addressId,
    context: ctx,
  })
}

export async function setDefaultAddress(actor: Actor, addressId: string): Promise<void> {
  assertSignedIn(actor)
  if (!mongoose.isValidObjectId(addressId)) throw new NotFoundError()
  await connectDb()
  const address = await Address.findById(addressId).select({ userId: 1 }).lean()
  assertOwnership(actor, address?.userId)
  await User.updateOne({ _id: actor.id }, { $set: { defaultAddressId: addressId } })
}

// ------------------------------------------------------------------ wishlist

const isSlug = (s: unknown): s is string =>
  typeof s === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) && s.length <= 80

/** The signed-in customer's wishlist as product slugs, newest first. Products no longer for sale drop out. */
export async function getWishlistSlugs(actor: Actor): Promise<string[]> {
  assertSignedIn(actor)
  await connectDb()
  const list = await Wishlist.findOne({ userId: actor.id }).lean()
  if (!list?.items.length) return []
  const products = await Product.find({
    _id: mongoose.trusted({ $in: list.items.map((i) => i.productId) }),
    status: "active",
  })
    .select({ slug: 1 })
    .lean<{ _id: mongoose.Types.ObjectId; slug: string }[]>()
  const bySlug = new Map(products.map((p) => [p._id.toString(), p.slug]))
  return list.items.flatMap((i) => bySlug.get(i.productId.toString()) ?? [])
}

async function productIdBySlug(slug: string): Promise<mongoose.Types.ObjectId | null> {
  if (!isSlug(slug)) return null
  const product = await Product.findOne({ slug, status: "active" }).select({ _id: 1 }).lean()
  return product?._id ?? null
}

export async function setWishlistItem(actor: Actor, slug: string, on: boolean): Promise<void> {
  assertSignedIn(actor)
  await connectDb()
  const productId = await productIdBySlug(slug)
  if (!productId) throw new NotFoundError()
  if (!on) {
    await Wishlist.updateOne({ userId: actor.id }, { $pull: { items: { productId } } })
    return
  }
  try {
    await Wishlist.findOneAndUpdate(
      { userId: actor.id, "items.productId": mongoose.trusted({ $ne: productId }) },
      {
        $push: {
          items: {
            $each: [{ productId, addedAt: new Date() }],
            $position: 0,
            $slice: WISHLIST_MAX_ITEMS,
          },
        },
      },
      { upsert: true }
    )
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error // already on the list: nothing to do
  }
}

/** Merges a guest wishlist into the account's (after signing in) and returns the combined list. */
export async function mergeWishlist(actor: Actor, slugs: string[]): Promise<string[]> {
  assertSignedIn(actor)
  await connectDb()
  const unique = [...new Set(slugs.filter(isSlug))].slice(0, WISHLIST_MAX_ITEMS)
  if (unique.length > 0) {
    const products = await Product.find({
      slug: mongoose.trusted({ $in: unique }),
      status: "active",
    })
      .select({ _id: 1, slug: 1 })
      .lean<{ _id: mongoose.Types.ObjectId; slug: string }[]>()
    const order = new Map(unique.map((s, i) => [s, i]))
    // Add the oldest first so the visitor's newest save ends up at the front.
    for (const p of products.sort((a, b) => (order.get(b.slug) ?? 0) - (order.get(a.slug) ?? 0)))
      await setWishlistItem(actor, p.slug, true)
  }
  return getWishlistSlugs(actor)
}
