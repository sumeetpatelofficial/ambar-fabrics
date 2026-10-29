import "server-only"
import mongoose from "mongoose"
import { connectDb } from "@/lib/db/mongoose"
import { ValidationError } from "@/lib/errors"
import { dayText, type HomeOffer } from "@/lib/home-offer"
import { formatPaise } from "@/lib/money"
import type { CouponRule } from "@/lib/pricing/totals"
import { Coupon, CouponRedemption, type CouponDoc } from "@/models/coupon"

const trusted = mongoose.trusted
const oid = (id: string) => new mongoose.Types.ObjectId(id)

/** One message for every reason a code cannot be used, apart from the ones the customer can act on. */
const NOT_VALID = "That code is not valid."

export const toRule = (c: CouponDoc): CouponRule =>
  c.type === "flat"
    ? { type: "flat", amountPaise: c.amountPaise! }
    : {
        type: "percent",
        percent: c.percent!,
        ...(c.maxDiscountPaise ? { maxDiscountPaise: c.maxDiscountPaise } : {}),
      }

/** Looks the code up and checks everything that can be checked without using it up. */
export async function resolveCoupon(
  rawCode: string,
  input: { subtotalPaise: number; userId: string; now?: Date }
): Promise<CouponDoc> {
  const code = rawCode.trim().toUpperCase()
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) throw new ValidationError(NOT_VALID)
  await connectDb()
  const now = input.now ?? new Date()
  const coupon = await Coupon.findOne({ code }).lean<CouponDoc>()
  if (!coupon || !coupon.active) throw new ValidationError(NOT_VALID)
  if (coupon.startsAt && coupon.startsAt > now)
    throw new ValidationError("That code is not active yet.")
  if (coupon.endsAt && coupon.endsAt < now) throw new ValidationError("That code has expired.")
  if (input.subtotalPaise < coupon.minOrderPaise)
    throw new ValidationError(
      `That code needs an order of at least ${formatPaise(coupon.minOrderPaise)}.`
    )
  if (coupon.usageLimit !== undefined && coupon.usedCount >= coupon.usageLimit)
    throw new ValidationError("That code has been fully used.")
  const mine = await CouponRedemption.countDocuments({
    couponId: coupon._id,
    userId: oid(input.userId),
  })
  if (mine >= coupon.perUserLimit) throw new ValidationError("You have already used that code.")
  return coupon
}

/**
 * Uses the coupon for an order. The overall limit is enforced by one conditional update, so two orders
 * cannot both take the last use. Throws when it is gone.
 */
export async function claimCoupon(
  coupon: CouponDoc,
  userId: string,
  orderId: string
): Promise<void> {
  await connectDb()
  const claimed = await Coupon.updateOne(
    {
      _id: coupon._id,
      active: true,
      ...(coupon.usageLimit !== undefined
        ? { usedCount: trusted({ $lt: coupon.usageLimit }) }
        : {}),
    },
    { $inc: { usedCount: 1 } }
  )
  if (claimed.modifiedCount !== 1) throw new ValidationError("That code has been fully used.")
  try {
    await CouponRedemption.create({
      couponId: coupon._id,
      userId: oid(userId),
      orderId: oid(orderId),
    })
  } catch (error) {
    await Coupon.updateOne({ _id: coupon._id }, { $inc: { usedCount: -1 } })
    throw error
  }
}

/** Gives the use back (the order expired, was cancelled or was refused). Safe to call twice. */
export async function releaseCoupon(orderId: string): Promise<void> {
  await connectDb()
  const redemption = await CouponRedemption.findOneAndDelete({ orderId: oid(orderId) }).lean()
  if (redemption) await Coupon.updateOne({ _id: redemption.couponId }, { $inc: { usedCount: -1 } })
}

/**
 * The coupon the owner has put on the home page (Admin, Coupons: "Show on the home page"), if it can still be
 * used: switched on, started, not ended and not used up. Public, read only, and it exposes only what the
 * page shows. Nothing is returned when no coupon qualifies, so the section simply does not appear.
 */
export async function getHomeOffer(now = new Date()): Promise<HomeOffer | null> {
  await connectDb()
  const coupon = await Coupon.findOne({
    showOnHome: true,
    active: true,
    // `null` matches a missing field too, so these read "no start date, or already started" and so on.
    $and: [
      { $or: [{ startsAt: null }, { startsAt: trusted({ $lte: now }) }] },
      { $or: [{ endsAt: null }, { endsAt: trusted({ $gte: now }) }] },
    ],
  } as never)
    .sort({ updatedAt: -1 })
    .lean<CouponDoc>()
  if (!coupon) return null
  if (
    coupon.usageLimit !== undefined &&
    coupon.usageLimit !== null &&
    coupon.usedCount >= coupon.usageLimit
  )
    return null
  const figure = coupon.type === "percent" ? coupon.percent : (coupon.amountPaise ?? 0) / 100
  if (!figure) return null
  return {
    code: coupon.code,
    kind: coupon.type,
    figure,
    ...(coupon.endsAt ? { endsOn: dayText(coupon.endsAt) } : {}),
    ...(coupon.minOrderPaise ? { minimumRupees: Math.round(coupon.minOrderPaise / 100) } : {}),
  }
}
