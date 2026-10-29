"use server"

import { AuthError } from "next-auth"
import { redirect } from "next/navigation"
import { after } from "next/server"
import { z } from "zod"
import { addressSchema, profileSchema } from "@/features/account/schemas"
import { changePasswordSchema } from "@/features/auth/schemas"
import { errorState, invalid } from "@/features/form-errors"
import type { FormState } from "@/features/form-state"
import { signIn, signOut } from "@/lib/auth"
import { getSessionUser, requireActor, toActor } from "@/lib/auth/session"
import { logger } from "@/lib/logger"
import { getRequestContext } from "@/lib/request-context"
import { enforceRateLimit, RULES } from "@/lib/security/rate-limit"
import { SLUG_PATTERN } from "@/lib/slug"
import {
  createAddress,
  deleteAddress,
  mergeWishlist,
  setDefaultAddress,
  setWishlistItem,
  updateAddress,
  updateProfile,
} from "@/services/account-service"
import { changePassword, requestPasswordReset, revokeAllSessions } from "@/services/auth-service"
import { drainJobs } from "@/services/job-service"

function sendQueuedEmails() {
  after(async () => {
    try {
      await drainJobs({ limit: 10 })
    } catch (error) {
      logger.error(
        {
          event: "jobs.inline_drain_failed",
          errorName: error instanceof Error ? error.name : "UnknownError",
        },
        "Inline email send failed"
      )
    }
  })
}

/** Every mutation here: signed-in actor from the session (never from the form), then a write limit. */
async function authorizedWrite(returnTo: string) {
  const actor = await requireActor(returnTo)
  const ctx = await getRequestContext()
  await enforceRateLimit(RULES.accountWrite, `user:${actor.id}`)
  return { actor, ctx }
}

// --------------------------------------------------------------------------- profile

export async function updateProfileAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const parsed = profileSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return invalid(parsed.error, formData)
  try {
    const { actor, ctx } = await authorizedWrite("/account/profile")
    await updateProfile(actor, parsed.data, ctx)
  } catch (error) {
    return errorState(error, formData)
  }
  return { status: "success", message: "Your details are saved." }
}

// --------------------------------------------------------------------------- addresses

export async function saveAddressAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = addressSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return invalid(parsed.error, formData)
  const id = String(formData.get("id") ?? "")
  try {
    const { actor, ctx } = await authorizedWrite("/account/addresses")
    if (id) await updateAddress(actor, id, parsed.data, ctx)
    else await createAddress(actor, parsed.data, ctx)
  } catch (error) {
    return errorState(error, formData)
  }
  return { status: "success", message: id ? "Address updated." : "Address added." }
}

export async function deleteAddressAction(formData: FormData): Promise<void> {
  const { actor, ctx } = await authorizedWrite("/account/addresses")
  await deleteAddress(actor, String(formData.get("id") ?? ""), ctx)
  redirect("/account/addresses")
}

export async function setDefaultAddressAction(formData: FormData): Promise<void> {
  const { actor } = await authorizedWrite("/account/addresses")
  await setDefaultAddress(actor, String(formData.get("id") ?? ""))
  redirect("/account/addresses")
}

// --------------------------------------------------------------------------- security

export async function changePasswordAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return invalid(parsed.error, formData)
  let stillSignedIn = false
  try {
    const actor = await requireActor("/account/change-password")
    const ctx = await getRequestContext()
    await enforceRateLimit(RULES.changePassword, `user:${actor.id}`, `ip:${ctx.ip}`)
    await changePassword(actor, parsed.data, ctx)
    sendQueuedEmails()
    // Every session just ended, including this one. Sign back in here so this device stays signed in.
    try {
      const url = await signIn("credentials", {
        email: actor.email,
        password: parsed.data.newPassword,
        redirect: false,
      })
      stillSignedIn = !new URL(String(url), "http://localhost").searchParams.has("error")
    } catch (error) {
      if (!(error instanceof AuthError)) throw error // a refusal here just means: sign in again
    }
  } catch (error) {
    return errorState(error, formData)
  }
  // Redirect rather than return a message: the new session cookie makes Next re-render the page and remount
  // this form, which would wipe a success message held in its state.
  redirect(stillSignedIn ? "/account/security?changed=1" : "/login?reset=1")
}

export async function revokeSessionsAction(): Promise<void> {
  const { actor, ctx } = await authorizedWrite("/account/security")
  await revokeAllSessions(actor, ctx)
  await signOut({ redirectTo: "/login?signedout=all" })
}

/** For accounts that only use Google: email a link to set a first password. */
export async function requestSetPasswordAction(): Promise<FormState> {
  try {
    const { actor, ctx } = await authorizedWrite("/account/security")
    if (!actor.email) return { status: "error", message: "We could not find your email address." }
    await requestPasswordReset(actor.email, ctx)
  } catch (error) {
    return errorState(error)
  }
  sendQueuedEmails()
  return {
    status: "success",
    message: "We have emailed you a link to set a password. It works for one hour.",
  }
}

// --------------------------------------------------------------------------- wishlist (called from client code)

const slugList = z.array(z.string().max(80).regex(SLUG_PATTERN)).max(200)

/** After sign-in: merge this browser's saved products into the account and return the combined list. */
export async function syncWishlistAction(slugs: string[]): Promise<string[] | null> {
  const user = await getSessionUser()
  if (!user) return null
  const parsed = slugList.safeParse(slugs)
  try {
    await enforceRateLimit(RULES.accountWrite, `user:${user.id}`)
    return await mergeWishlist(toActor(user), parsed.success ? parsed.data : [])
  } catch {
    return null
  }
}

export async function setWishlistItemAction(slug: string, on: boolean): Promise<boolean> {
  const user = await getSessionUser()
  if (!user || typeof slug !== "string" || !SLUG_PATTERN.test(slug)) return false
  try {
    await enforceRateLimit(RULES.accountWrite, `user:${user.id}`)
    await setWishlistItem(toActor(user), slug, Boolean(on))
    return true
  } catch {
    return false
  }
}
