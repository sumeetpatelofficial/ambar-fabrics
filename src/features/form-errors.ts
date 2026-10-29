import "server-only"
import type { z } from "zod"
import {
  isDatabaseUnavailable,
  NotFoundError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
} from "@/lib/errors"
import { logger } from "@/lib/logger"
import type { FormState } from "@/features/form-state"

/** First problem per field, in plain language, for showing next to each input. */
export function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form")
    if (!(key in out)) out[key] = issue.message
  }
  return out
}

/** Values to echo back into the form. Anything that looks like a secret is left out. */
export function safeValues(data: FormData): Record<string, string> {
  const values: Record<string, string> = {}
  for (const [key, value] of data.entries()) {
    if (typeof value === "string" && !/password|token/i.test(key)) values[key] = value.slice(0, 300)
  }
  return values
}

export function invalid(error: z.ZodError, data: FormData): FormState {
  return {
    status: "error",
    fieldErrors: fieldErrorsFrom(error),
    message: "Please check the highlighted fields.",
    values: safeValues(data),
  }
}

/**
 * Turns a thrown error into something safe to show. Anticipated errors have friendly text; anything else
 * is logged and shown as a generic message, never its detail.
 */
export function errorState(error: unknown, data?: FormData): FormState {
  const values = data ? safeValues(data) : undefined
  if (error instanceof TooManyRequestsError) {
    const minutes = Math.max(1, Math.ceil(error.retryAfterSeconds / 60))
    return {
      status: "error",
      message: `Too many attempts. Please wait about ${minutes} ${minutes === 1 ? "minute" : "minutes"} and try again.`,
      values,
    }
  }
  if (error instanceof ValidationError) {
    const details = Array.isArray(error.details)
      ? (error.details as { path?: string; issue?: string }[])
      : []
    const fieldErrors = Object.fromEntries(
      details.filter((d) => d.path && d.issue).map((d) => [d.path as string, d.issue as string])
    )
    return {
      status: "error",
      message: error.message,
      fieldErrors: Object.keys(fieldErrors).length ? fieldErrors : undefined,
      values,
    }
  }
  if (error instanceof NotFoundError)
    return { status: "error", message: "We could not find that. It may have been removed.", values }
  if (error instanceof UnauthorizedError)
    return { status: "error", message: "Please sign in again to continue.", values }
  if (isDatabaseUnavailable(error))
    return {
      status: "error",
      message: "We could not complete that just now. Please try again in a moment.",
      values,
    }
  logger.error(
    {
      event: "action.failed",
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message.slice(0, 200) : undefined,
    },
    "Form action failed"
  )
  return { status: "error", message: "Something went wrong on our side. Please try again.", values }
}
