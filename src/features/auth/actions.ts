"use server"

import { AuthError } from "next-auth"
import { redirect } from "next/navigation"
import { after } from "next/server"
import { errorState, invalid } from "@/features/form-errors"
import type { FormState } from "@/features/form-state"
import {
  forgotSchema,
  loginSchema,
  registerSchema,
  resendSchema,
  resetSchema,
  safeNextPath,
  tokenSchema,
} from "@/features/auth/schemas"
import { signIn, signOut } from "@/lib/auth"
import type { SignInFailure } from "@/lib/auth/errors"
import { logger } from "@/lib/logger"
import { getRequestContext } from "@/lib/request-context"
import { enforceRateLimit, RULES } from "@/lib/security/rate-limit"
import {
  registerUser,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  verifyEmail,
} from "@/services/auth-service"
import { drainJobs } from "@/services/job-service"

/** Send queued emails right after responding. A cron run retries anything that fails here. */
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

const SIGN_IN_MESSAGES: Record<SignInFailure, string> = {
  invalid: "That email and password do not match. Check them and try again.",
  unverified: "Please confirm your email address first. We can send the link again.",
  suspended: "This account is not available. Contact us if you think that is a mistake.",
  rate_limited: "Too many attempts. Please wait a few minutes and try again.",
}

// --------------------------------------------------------------------------- register

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return invalid(parsed.error, formData)
  try {
    const ctx = await getRequestContext()
    await enforceRateLimit(RULES.register, `ip:${ctx.ip}`, `email:${parsed.data.email}`)
    await registerUser(parsed.data, ctx)
  } catch (error) {
    return errorState(error, formData)
  }
  sendQueuedEmails()
  // The same message whether or not the address was already registered.
  return {
    status: "success",
    message: "Check your email. If this address can be used, we have sent a link to confirm it.",
    values: { email: parsed.data.email },
  }
}

// --------------------------------------------------------------------------- sign in and out

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return invalid(parsed.error, formData)
  const { email, password, next } = parsed.data

  let failure: SignInFailure | null = null
  try {
    // Rate limiting and every credential check happen inside Auth.js's authorize step (lib/auth).
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      redirectTo: safeNextPath(next),
    })
    const url = new URL(String(result), "http://localhost")
    if (url.searchParams.has("error")) {
      const code = url.searchParams.get("code")
      failure =
        code === "unverified" || code === "suspended" || code === "rate_limited" ? code : "invalid"
    }
  } catch (error) {
    if (!(error instanceof AuthError)) return errorState(error, formData)
    const code = (error as AuthError & { code?: string }).code
    failure =
      code === "unverified" || code === "suspended" || code === "rate_limited" ? code : "invalid"
  }
  if (failure) {
    return {
      status: "error",
      message: SIGN_IN_MESSAGES[failure],
      values: { email },
      ...(failure === "unverified" ? { hint: "unverified" as const } : {}),
    }
  }
  redirect(safeNextPath(next)) // outside the try: redirect() works by throwing
}

export async function googleSignInAction(formData: FormData): Promise<void> {
  const next = safeNextPath(String(formData.get("next") ?? ""))
  await signIn("google", { redirectTo: next })
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" })
}

// --------------------------------------------------------------------------- email confirmation

export async function verifyEmailAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = tokenSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success)
    return { status: "error", message: "This link is invalid or has expired. Request a new one." }
  try {
    const ctx = await getRequestContext()
    await enforceRateLimit(RULES.verifyEmail, `ip:${ctx.ip}`)
    await verifyEmail(parsed.data.token, ctx)
  } catch (error) {
    return errorState(error)
  }
  return { status: "success", message: "Your email is confirmed. You can sign in now." }
}

export async function resendVerificationAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const parsed = resendSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return invalid(parsed.error, formData)
  try {
    const ctx = await getRequestContext()
    await enforceRateLimit(RULES.resendVerification, `ip:${ctx.ip}`, `email:${parsed.data.email}`)
    await resendVerification(parsed.data.email, ctx)
  } catch (error) {
    return errorState(error, formData)
  }
  sendQueuedEmails()
  return {
    status: "success",
    message: "If that address is waiting to be confirmed, we have sent a new link.",
    values: { email: parsed.data.email },
  }
}

// --------------------------------------------------------------------------- password reset

export async function forgotPasswordAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const parsed = forgotSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return invalid(parsed.error, formData)
  try {
    const ctx = await getRequestContext()
    await enforceRateLimit(RULES.forgotPassword, `ip:${ctx.ip}`, `email:${parsed.data.email}`)
    await requestPasswordReset(parsed.data.email, ctx)
  } catch (error) {
    return errorState(error, formData)
  }
  sendQueuedEmails()
  return {
    status: "success",
    message:
      "If there is an account for that address, we have emailed a link to reset the password. It works for one hour.",
    values: { email: parsed.data.email },
  }
}

export async function resetPasswordAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const parsed = resetSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return invalid(parsed.error, formData)
  try {
    const ctx = await getRequestContext()
    await enforceRateLimit(RULES.resetPassword, `ip:${ctx.ip}`)
    await resetPassword(parsed.data.token, parsed.data.password, ctx)
  } catch (error) {
    return errorState(error, formData)
  }
  sendQueuedEmails()
  redirect("/login?reset=1")
}
