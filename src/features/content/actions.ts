"use server"

import { z } from "zod"
import { errorState, invalid } from "@/features/form-errors"
import type { FormState } from "@/features/form-state"
import { getRequestContext } from "@/lib/request-context"
import { enforceRateLimit } from "@/lib/security/rate-limit"
import { contactSchema, sendContactMessage } from "@/services/contact-service"
import { trackOrder, type TrackedOrder } from "@/services/tracking-service"

/** A visitor writes to the shop. A hidden field catches simple bots; a limit stops floods. */
export async function sendContactAction(_prev: FormState, fd: FormData): Promise<FormState> {
  // Real visitors never see or fill this field. Pretend it worked so a bot learns nothing.
  if (String(fd.get("website") ?? "") !== "")
    return { status: "success", message: "Thank you. We will reply within one working day." }
  const parsed = contactSchema.safeParse(Object.fromEntries(fd))
  if (!parsed.success) return invalid(parsed.error, fd)
  try {
    const { ip } = await getRequestContext()
    await enforceRateLimit({ name: "contact", limit: 5, windowSeconds: 60 * 60 }, `ip:${ip}`)
    await sendContactMessage(parsed.data)
  } catch (error) {
    return errorState(error, fd)
  }
  return { status: "success", message: "Thank you. We will reply within one working day." }
}

const trackSchema = z.object({
  orderNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{6,30}$/, "Enter the order number from your email."),
  email: z.string().trim().email("Enter the email address on the order."),
})

export type TrackState =
  | { status: "idle" }
  | { status: "error"; message: string; values: { orderNumber: string; email: string } }
  | { status: "found"; order: TrackedOrder }

/** Anyone with the order number and its email can see its progress. Limited per visitor and per order number. */
export async function trackOrderAction(_prev: TrackState, fd: FormData): Promise<TrackState> {
  const typed = {
    orderNumber: String(fd.get("orderNumber") ?? "").slice(0, 40),
    email: String(fd.get("email") ?? "").slice(0, 254),
  }
  const parsed = trackSchema.safeParse(typed)
  if (!parsed.success)
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Please check the details.",
      values: typed,
    }
  try {
    const { ip } = await getRequestContext()
    await enforceRateLimit(
      { name: "track", limit: 15, windowSeconds: 15 * 60 },
      `ip:${ip}`,
      `order:${parsed.data.orderNumber}`
    )
    const order = await trackOrder(parsed.data.orderNumber, parsed.data.email)
    if (!order)
      return {
        status: "error",
        message:
          "We could not find an order with those details. Check the order number and the email it was placed with.",
        values: typed,
      }
    return { status: "found", order }
  } catch (error) {
    const state = errorState(error)
    return {
      status: "error",
      message: state.message ?? "Please try again in a moment.",
      values: typed,
    }
  }
}
