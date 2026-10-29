import "server-only"
import { connectDb } from "@/lib/db/mongoose"
import { TooManyRequestsError } from "@/lib/errors"
import { RateLimitBucket } from "@/models/rate-limit-bucket"

/**
 * Fixed-window counters kept in MongoDB, so limits hold across all serverless instances without another
 * service. Each check is one atomic upsert-and-increment. A burst straddling a window edge can briefly
 * allow up to twice the limit, which is acceptable for sign-in and reset endpoints. High-volume public
 * reads rely on the CDN cache instead (see docs/security.md).
 */
export type RateRule = { name: string; limit: number; windowSeconds: number }

export const RULES = {
  login: { name: "login", limit: 5, windowSeconds: 15 * 60 },
  register: { name: "register", limit: 5, windowSeconds: 15 * 60 },
  forgotPassword: { name: "forgot", limit: 5, windowSeconds: 15 * 60 },
  resetPassword: { name: "reset", limit: 10, windowSeconds: 15 * 60 },
  verifyEmail: { name: "verify", limit: 10, windowSeconds: 15 * 60 },
  resendVerification: { name: "resend", limit: 3, windowSeconds: 15 * 60 },
  changePassword: { name: "chgpw", limit: 5, windowSeconds: 15 * 60 },
  accountWrite: { name: "acct", limit: 60, windowSeconds: 10 * 60 },
} as const satisfies Record<string, RateRule>

export type RateResult = { allowed: boolean; remaining: number; retryAfterSeconds: number }

export async function checkRateLimit(
  rule: RateRule,
  subject: string,
  now = Date.now()
): Promise<RateResult> {
  await connectDb()
  const windowMs = rule.windowSeconds * 1000
  const windowStart = Math.floor(now / windowMs) * windowMs
  const bucket = await RateLimitBucket.findOneAndUpdate(
    { _id: `${rule.name}:${subject}:${windowStart}` },
    { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(windowStart + windowMs * 2) } },
    { upsert: true, returnDocument: "after" }
  ).lean()
  const count = bucket?.count ?? 1
  return {
    allowed: count <= rule.limit,
    remaining: Math.max(0, rule.limit - count),
    retryAfterSeconds: Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000)),
  }
}

/** Throws TooManyRequestsError when the rule is exceeded. Fails closed: a limiter outage stops the request. */
export async function enforceRateLimit(rule: RateRule, ...subjects: string[]): Promise<void> {
  for (const subject of subjects) {
    const result = await checkRateLimit(rule, subject)
    if (!result.allowed) throw new TooManyRequestsError(result.retryAfterSeconds)
  }
}

/**
 * Best-effort client address. Behind Vercel the first `x-forwarded-for` entry is set by the platform and
 * cannot be forged by the visitor; self-hosting needs a trusted proxy that does the same.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return (forwarded || headers.get("x-real-ip") || "unknown").slice(0, 64)
}
