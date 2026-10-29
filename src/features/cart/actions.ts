"use server"

import { z } from "zod"
import type { BagLineInput, CartResult, PricedCart } from "@/features/cart/types"
import { getSessionUser } from "@/lib/auth/session"
import { AppError } from "@/lib/errors"
import { getRequestContext } from "@/lib/request-context"
import { enforceRateLimit, type RateRule } from "@/lib/security/rate-limit"
import {
  addToCart,
  getCartLines,
  mergeGuestBag,
  priceLines,
  removeFromCart,
  setCartQuantity,
} from "@/services/cart-service"
import { CART_MAX_LINES } from "@/models/cart"

// Everything arriving here is untrusted, including quantities and ids from the browser's own storage.
const variantId = z.string().regex(/^[0-9a-f]{24}$/)
const quantity = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
const lineList = z.array(z.object({ variantId, qty: quantity })).max(CART_MAX_LINES)

const WRITE: RateRule = { name: "cart", limit: 120, windowSeconds: 10 * 60 }
const READ: RateRule = { name: "cartread", limit: 240, windowSeconds: 10 * 60 }

async function limit(rule: RateRule, userId?: string) {
  const { ip } = await getRequestContext()
  await enforceRateLimit(rule, userId ? `user:${userId}` : `ip:${ip}`)
}

const failure = (error: unknown): CartResult => ({
  ok: false,
  message:
    error instanceof AppError && error.status < 500
      ? error.message
      : "We could not update your bag. Please try again.",
})

/**
 * The priced bag. Signed in: the saved bag (anything the browser sends is ignored). Signed out: the
 * lines this browser holds, priced from the live catalogue.
 */
export async function getPricedCartAction(guestLines: BagLineInput[]): Promise<PricedCart | null> {
  try {
    const user = await getSessionUser()
    await limit(READ, user?.id)
    if (user) return await priceLines(await getCartLines(user.id))
    const parsed = lineList.safeParse(guestLines)
    return await priceLines(parsed.success ? parsed.data : [])
  } catch {
    return null
  }
}

async function signedInWrite<T>(run: (userId: string) => Promise<T>): Promise<T | CartResult> {
  try {
    const user = await getSessionUser()
    if (!user) return { ok: false, message: "Please sign in again to change your bag." }
    await limit(WRITE, user.id)
    return await run(user.id)
  } catch (error) {
    return failure(error)
  }
}

export async function addToCartAction(id: string, qty: number): Promise<CartResult> {
  const parsed = z.object({ id: variantId, qty: quantity }).safeParse({ id, qty })
  if (!parsed.success) return { ok: false, message: "That item is not valid." }
  return (await signedInWrite(async (uid) => ({
    ok: true as const,
    lines: await addToCart(uid, parsed.data.id, parsed.data.qty),
  }))) as CartResult
}

/** Zero removes the line. */
export async function setCartQuantityAction(id: string, qty: number): Promise<CartResult> {
  const parsed = z
    .object({ id: variantId, qty: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) })
    .safeParse({ id, qty })
  if (!parsed.success) return { ok: false, message: "That quantity is not valid." }
  return (await signedInWrite(async (uid) => ({
    ok: true as const,
    lines: await setCartQuantity(uid, parsed.data.id, parsed.data.qty),
  }))) as CartResult
}

export async function removeFromCartAction(id: string): Promise<CartResult> {
  const parsed = variantId.safeParse(id)
  if (!parsed.success) return { ok: false, message: "That item is not valid." }
  return (await signedInWrite(async (uid) => ({
    ok: true as const,
    lines: await removeFromCart(uid, parsed.data),
  }))) as CartResult
}

/** After sign-in: folds this browser's bag into the account's and returns the combined bag. */
export async function mergeCartAction(
  guestLines: BagLineInput[],
  mergeId?: string
): Promise<CartResult> {
  const parsed = lineList.safeParse(guestLines)
  const id = z
    .string()
    .min(8)
    .max(80)
    .regex(/^[A-Za-z0-9_-]+$/)
    .safeParse(mergeId)
  return (await signedInWrite(async (uid) => {
    const { lines, notices } = await mergeGuestBag(
      uid,
      parsed.success ? parsed.data : [],
      id.success ? id.data : undefined
    )
    return { ok: true as const, lines, notices }
  })) as CartResult
}
