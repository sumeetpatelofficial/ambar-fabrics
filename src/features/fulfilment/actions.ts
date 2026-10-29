"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { getSessionUser, toActor } from "@/lib/auth/session"
import { AppError } from "@/lib/errors"
import { getRequestContext } from "@/lib/request-context"
import { enforceRateLimit, type RateRule } from "@/lib/security/rate-limit"
import { cancelPaidOrder } from "@/services/cancellation-service"
import { checkDelivery, type DeliveryCheck } from "@/services/delivery-service"
import { decideReturn, receiveReturn, requestReturn } from "@/services/return-service"
import { cancelShipmentForOrder, createShipmentForOrder } from "@/services/shipping-service"

const PINCHECK: RateRule = { name: "pincheck", limit: 60, windowSeconds: 10 * 60 }
const WRITE: RateRule = { name: "fulfil", limit: 60, windowSeconds: 10 * 60 }

export type Done = { ok: true } | { ok: false; message: string }
const fail = (error: unknown): Done => ({
  ok: false,
  message:
    error instanceof AppError && error.status < 500
      ? error.message
      : "Something went wrong. Please try again.",
})

const orderNumber = z.string().regex(/^[A-Z0-9-]{6,30}$/)
const objectId = z.string().regex(/^[0-9a-f]{24}$/)

async function actorFor() {
  const user = await getSessionUser()
  if (!user) return null
  const { ip } = await getRequestContext()
  await enforceRateLimit(WRITE, `user:${user.id}`, `ip:${ip}`)
  return toActor(user)
}

/** Public: whether we deliver to a PIN code. Limited per visitor address. */
export async function checkDeliveryAction(pincode: string): Promise<DeliveryCheck> {
  try {
    const { ip } = await getRequestContext()
    await enforceRateLimit(PINCHECK, `ip:${ip}`)
    return await checkDelivery(String(pincode).trim())
  } catch {
    return { error: "Please try again in a moment." }
  }
}

// ---- customer

export async function cancelMyOrderAction(number: string, reason: string): Promise<Done> {
  try {
    const actor = await actorFor()
    const n = orderNumber.safeParse(number)
    if (!actor || !n.success) return { ok: false, message: "Please sign in to continue." }
    await cancelPaidOrder(actor, n.data, {
      reason: reason.trim().slice(0, 200) || "Cancelled by customer",
      asCustomer: true,
    })
    revalidatePath(`/account/orders/${n.data}`)
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function requestReturnAction(
  number: string,
  items: { variantId: string; qty: number }[],
  reason: string
): Promise<Done> {
  try {
    const actor = await actorFor()
    const parsed = z
      .object({
        n: orderNumber,
        items: z
          .array(z.object({ variantId: objectId, qty: z.number().int().min(1) }))
          .min(1)
          .max(50),
        reason: z.string().trim().min(3).max(500),
      })
      .safeParse({ n: number, items, reason })
    if (!actor) return { ok: false, message: "Please sign in to continue." }
    if (!parsed.success) return { ok: false, message: "Choose what to return and tell us why." }
    await requestReturn(actor.id, parsed.data.n, parsed.data.items, parsed.data.reason)
    revalidatePath(`/account/orders/${parsed.data.n}`)
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

// ---- staff (the services check the permission each time)

async function staff(
  run: (actor: NonNullable<Awaited<ReturnType<typeof actorFor>>>) => Promise<unknown>,
  number?: string
): Promise<Done> {
  try {
    const actor = await actorFor()
    if (!actor) return { ok: false, message: "Please sign in to continue." }
    await run(actor)
    if (number) revalidatePath(`/admin/orders/${number}`)
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function bookShipmentAction(number: string): Promise<Done> {
  const n = orderNumber.safeParse(number)
  if (!n.success) return { ok: false, message: "That order number is not valid." }
  return staff((a) => createShipmentForOrder(a, n.data), n.data)
}

export async function cancelShipmentAction(number: string): Promise<Done> {
  const n = orderNumber.safeParse(number)
  if (!n.success) return { ok: false, message: "That order number is not valid." }
  return staff((a) => cancelShipmentForOrder(a, n.data), n.data)
}

export async function staffCancelOrderAction(number: string, reason: string): Promise<Done> {
  const n = orderNumber.safeParse(number)
  if (!n.success) return { ok: false, message: "That order number is not valid." }
  return staff((a) => cancelPaidOrder(a, n.data, { reason }), n.data)
}

export async function decideReturnAction(
  number: string,
  returnId: string,
  approve: boolean,
  note: string
): Promise<Done> {
  const n = orderNumber.safeParse(number)
  const id = objectId.safeParse(returnId)
  if (!n.success || !id.success) return { ok: false, message: "That return is not valid." }
  return staff(
    (a) => decideReturn(a, id.data, approve ? { approve: true } : { approve: false, note }),
    n.data
  )
}

export async function receiveReturnAction(number: string, returnId: string): Promise<Done> {
  const n = orderNumber.safeParse(number)
  const id = objectId.safeParse(returnId)
  if (!n.success || !id.success) return { ok: false, message: "That return is not valid." }
  return staff((a) => receiveReturn(a, id.data), n.data)
}
