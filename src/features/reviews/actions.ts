"use server"

import { updateTag } from "next/cache"
import { reviewInputSchema } from "@/features/reviews/schemas"
import { errorState, invalid } from "@/features/form-errors"
import type { FormState } from "@/features/form-state"
import { requireActor } from "@/lib/auth/session"
import { getRequestContext } from "@/lib/request-context"
import { enforceRateLimit } from "@/lib/security/rate-limit"
import { SLUG_PATTERN } from "@/lib/slug"
import { submitReview } from "@/services/review-service"

/** A buyer sends or edits their review. It goes to staff first; the page says so. */
export async function submitReviewAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const slug = String(fd.get("slug") ?? "")
  if (!SLUG_PATTERN.test(slug))
    return { status: "error", message: "We could not find that product." }
  const parsed = reviewInputSchema.safeParse({
    rating: fd.get("rating") ?? "",
    title: String(fd.get("title") ?? ""),
    body: String(fd.get("body") ?? ""),
  })
  if (!parsed.success) return invalid(parsed.error, fd)
  try {
    const actor = await requireActor(`/products/${slug}`)
    const ctx = await getRequestContext()
    await enforceRateLimit(
      { name: "review", limit: 10, windowSeconds: 60 * 60 },
      `user:${actor.id}`,
      `ip:${ctx.ip}`
    )
    await submitReview(actor.id, slug, parsed.data)
    updateTag(`reviews:${slug}`)
    updateTag(`product:${slug}`)
  } catch (error) {
    return errorState(error, fd)
  }
  return {
    status: "success",
    message: "Thank you. Your review will appear once we have read it.",
  }
}
