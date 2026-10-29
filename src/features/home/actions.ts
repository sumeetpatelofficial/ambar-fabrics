"use server"

import { z } from "zod"
import type { FormState } from "@/features/form-state"
import { AppError } from "@/lib/errors"
import { getRequestContext } from "@/lib/request-context"
import { enforceRateLimit, type RateRule } from "@/lib/security/rate-limit"

const SIGNUP: RateRule = { name: "newsletter", limit: 5, windowSeconds: 60 * 60 }
const email = z.string().trim().toLowerCase().email().max(254)

/**
 * The home page's "get new arrivals and offers first" form.
 *
 * TODO: nothing stores the address yet. Before this form is shown to the public, decide where sign-ups
 * go (a Subscriber collection with a double opt-in email through the existing mail outbox, or an email
 * service) and save the address here. Until then this only checks the address and says thank you.
 */
export async function subscribeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = email.safeParse(formData.get("email"))
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: { email: "Enter an email address such as name@example.com." },
      values: { email: String(formData.get("email") ?? "").slice(0, 254) },
    }
  }
  try {
    const { ip } = await getRequestContext()
    await enforceRateLimit(SIGNUP, `ip:${ip}`)
  } catch (error) {
    if (error instanceof AppError) {
      return { status: "error", message: "Too many tries. Please try again in an hour." }
    }
    throw error
  }
  return { status: "success", message: "Thank you. We will write when there is something new." }
}
