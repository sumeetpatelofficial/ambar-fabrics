/**
 * Password rules. Pure and free of server code, so forms can show the same limits the server enforces.
 * Length matters most; there are no forced symbol rules.
 */
export const PASSWORD_MIN = 10
export const PASSWORD_MAX = 128

const COMMON = new Set(
  [
    "password",
    "password1",
    "password12",
    "password123",
    "password1234",
    "passw0rd123",
    "qwertyuiop",
    "qwerty12345",
    "qwerty123456",
    "1234567890",
    "12345678910",
    "123456789012",
    "0123456789",
    "1q2w3e4r5t",
    "1qaz2wsx3edc",
    "abcdefghij",
    "abcd123456",
    "iloveyou123",
    "welcome123",
    "welcome1234",
    "admin12345",
    "administrator",
    "letmein1234",
    "monkey12345",
    "dragon12345",
    "football123",
    "baseball123",
    "superman123",
    "trustno1234",
    "sunshine123",
    "princess123",
    "whatever123",
    "changeme123",
    "changeme1234",
    "default1234",
    "india12345",
    "india123456",
    "ambarfabrics",
    "ambarfabrics1",
    "ambar12345",
    "krishna123",
    "ganesh1234",
    "sai1234567",
    "jaishreeram",
    "shreekrishna",
    "omnamahshivaya",
    "bollywood123",
    "cricket1234",
  ].map((p) => p.toLowerCase())
)

export type PasswordProblem =
  "too_short" | "too_long" | "common" | "repetitive" | "contains_email" | "contains_name"

export const PASSWORD_MESSAGES: Record<PasswordProblem, string> = {
  too_short: `Use at least ${PASSWORD_MIN} characters.`,
  too_long: `Use no more than ${PASSWORD_MAX} characters.`,
  common: "That password is too common. Choose something less guessable.",
  repetitive: "Avoid repeating one character or a simple sequence.",
  contains_email: "Do not include your email address in your password.",
  contains_name: "Do not include your name in your password.",
}

/** Length, commonness and obvious personal data. Length matters most; there are no forced symbol rules. */
export function checkPassword(
  password: string,
  context: { email?: string; name?: string } = {}
): PasswordProblem | null {
  if (password.length < PASSWORD_MIN) return "too_short"
  if (password.length > PASSWORD_MAX) return "too_long"
  const lower = password.toLowerCase()
  if (COMMON.has(lower) || COMMON.has(lower.replace(/[^a-z0-9]/g, ""))) return "common"
  if (new Set(lower).size <= 3) return "repetitive"
  if ("0123456789".includes(lower) || "abcdefghijklmnopqrstuvwxyz".includes(lower))
    return "repetitive"
  const local = context.email?.split("@")[0]?.toLowerCase()
  if (local && local.length >= 4 && lower.includes(local)) return "contains_email"
  const first = context.name?.trim().split(/\s+/)[0]?.toLowerCase()
  if (first && first.length >= 4 && lower.includes(first)) return "contains_name"
  return null
}
