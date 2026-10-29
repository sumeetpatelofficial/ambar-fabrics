import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

/** 256 random bits as URL-safe text. This is what goes in an email link. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url")
}

/** What is stored in the database. A leaked database therefore does not leak usable links. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

/** Constant-time comparison for secrets of equal or unequal length. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}
