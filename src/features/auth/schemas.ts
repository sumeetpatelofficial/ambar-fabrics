import { z } from "zod"
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/security/password-policy"

/** Shared by forms (for instant messages) and server actions (the real check). */
export const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Enter your email address.")
  .max(254, "That email address is too long.")
  .pipe(z.email("Enter a valid email address."))

const name = z.string().trim().min(1, "Enter your name.").max(80, "Use 80 characters or fewer.")

const newPassword = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
  .max(PASSWORD_MAX, `Use no more than ${PASSWORD_MAX} characters.`)

export const registerSchema = z.object({ name, email, password: newPassword })
export const loginSchema = z.object({
  email,
  // Not length-checked beyond a sane cap: login must not reveal the password rules.
  password: z.string().min(1, "Enter your password.").max(PASSWORD_MAX),
  next: z.string().max(300).optional(),
})
export const forgotSchema = z.object({ email })
export const resendSchema = z.object({ email })
export const tokenSchema = z.object({ token: z.string().min(20).max(200) })
export const resetSchema = z.object({ token: z.string().min(20).max(200), password: newPassword })
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password.").max(PASSWORD_MAX),
  newPassword,
})

/** Only same-site relative paths may be used as a post-login destination (no open redirect). */
export function safeNextPath(next: string | null | undefined, fallback = "/account"): string {
  if (
    !next ||
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.includes("\\") ||
    /[\u0000-\u001f]/.test(next)
  )
    return fallback
  if (next.startsWith("/login") || next.startsWith("/register") || next.startsWith("/api/"))
    return fallback
  return next
}
