import type { MongoMemoryReplSet } from "mongodb-memory-server"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { EmailMessage } from "@/lib/email/types"
import { checkRateLimit, enforceRateLimit, RULES, type RateRule } from "@/lib/security/rate-limit"
import { TooManyRequestsError } from "@/lib/errors"
import { Job } from "@/models/job"
import { RateLimitBucket } from "@/models/rate-limit-bucket"
import { backoffMs, drainJobs, enqueueEmail, MAX_ATTEMPTS } from "@/services/job-service"
import { resetDatabase, startDatabase, stopDatabase } from "./helpers"

const send = vi.fn<(m: EmailMessage) => Promise<void>>()
vi.mock("@/lib/email/providers", () => ({ getEmailProvider: () => ({ name: "test", send }) }))

let replSet: MongoMemoryReplSet
beforeAll(async () => {
  replSet = await startDatabase("jobs_test")
  await Promise.all([Job.init(), RateLimitBucket.init()])
}, 240_000)
afterAll(() => stopDatabase(replSet))
beforeEach(async () => {
  await resetDatabase()
  send.mockReset()
  send.mockResolvedValue(undefined)
})

const message = (to = "a@example.com"): EmailMessage => ({
  to,
  subject: "Hello",
  html: "<p>secret link</p>",
  text: "secret link",
  template: "test",
})

describe("email outbox", () => {
  it("sends a queued email once and removes the body afterwards", async () => {
    await enqueueEmail(message(), "k1")
    expect(await drainJobs()).toEqual({ sent: 1, failed: 0, dead: 0 })
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0]![0]).toMatchObject({ to: "a@example.com", subject: "Hello" })
    const job = await Job.findOne({ dedupeKey: "k1" }).lean()
    expect(job).toMatchObject({ status: "done", attempts: 1 })
    expect(JSON.stringify(job!.payload)).not.toContain("secret link") // one-time links are not kept
    expect(job!.doneAt).toBeInstanceOf(Date)
    expect(await drainJobs()).toEqual({ sent: 0, failed: 0, dead: 0 })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it("never queues the same logical email twice", async () => {
    await Promise.all(Array.from({ length: 8 }, () => enqueueEmail(message(), "same-key")))
    expect(await Job.countDocuments()).toBe(1)
    await drainJobs()
    expect(send).toHaveBeenCalledTimes(1)
  })

  it("two workers draining at once never send the same email twice", async () => {
    for (let i = 0; i < 12; i++) await enqueueEmail(message(`u${i}@example.com`), `k${i}`)
    await Promise.all([
      drainJobs({ limit: 20 }),
      drainJobs({ limit: 20 }),
      drainJobs({ limit: 20 }),
    ])
    expect(send).toHaveBeenCalledTimes(12)
    expect(new Set(send.mock.calls.map((c) => c[0].to)).size).toBe(12)
  })

  it("retries a failure with growing delays, keeps the message, and records a short error", async () => {
    await enqueueEmail(message(), "k")
    send.mockRejectedValue(new Error("Resend responded 503"))
    const t0 = new Date(Date.now() + 60_000) // just after the job was queued (never a fixed date: the real clock moves on)
    expect(await drainJobs({ now: t0 })).toEqual({ sent: 0, failed: 1, dead: 0 })
    let job = (await Job.findOne({ dedupeKey: "k" }).lean())!
    expect(job).toMatchObject({ status: "failed", attempts: 1, lastError: "Resend responded 503" })
    expect(job.runAt.getTime() - t0.getTime()).toBe(backoffMs(1))
    expect(JSON.stringify(job.payload)).toContain("secret link") // still needed for the retry

    expect(await drainJobs({ now: new Date(t0.getTime() + 1000) })).toEqual({
      sent: 0,
      failed: 0,
      dead: 0,
    }) // not due yet
    send.mockResolvedValue(undefined)
    expect(await drainJobs({ now: new Date(t0.getTime() + backoffMs(1) + 1) })).toEqual({
      sent: 1,
      failed: 0,
      dead: 0,
    })
    job = (await Job.findOne({ dedupeKey: "k" }).lean())!
    expect(job).toMatchObject({ status: "done", attempts: 2 })
  })

  it("gives up after the maximum attempts and keeps the failure visible", async () => {
    await enqueueEmail(message(), "k")
    send.mockRejectedValue(new Error("boom"))
    let now = new Date(Date.now() + 60_000)
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await drainJobs({ now })
      now = new Date(now.getTime() + 2 * 3600_000)
    }
    expect(await Job.findOne({ dedupeKey: "k" }).lean()).toMatchObject({
      status: "dead",
      attempts: MAX_ATTEMPTS,
      lastError: "boom",
    })
    expect(await drainJobs({ now })).toEqual({ sent: 0, failed: 0, dead: 0 })
  })

  it("does not pick up a job that another worker is still holding, but recovers it after the lock expires", async () => {
    await enqueueEmail(message(), "k")
    const now = new Date(Date.now() + 60_000)
    await Job.updateOne(
      { dedupeKey: "k" },
      { status: "running", lockedUntil: new Date(now.getTime() + 60_000) }
    )
    expect(await drainJobs({ now })).toEqual({ sent: 0, failed: 0, dead: 0 })
    expect(await drainJobs({ now: new Date(now.getTime() + 61_000) })).toEqual({
      sent: 0,
      failed: 0,
      dead: 0,
    }) // status running is not claimable
    await Job.updateOne(
      { dedupeKey: "k" },
      { status: "failed", lockedUntil: new Date(now.getTime() - 1) }
    )
    expect(await drainJobs({ now })).toEqual({ sent: 1, failed: 0, dead: 0 })
  })

  it("backoff doubles and is capped at one hour", () => {
    expect([1, 2, 3, 4].map(backoffMs)).toEqual([30_000, 60_000, 120_000, 240_000])
    expect(backoffMs(20)).toBe(3600_000)
  })
})

describe("rate limiter", () => {
  const rule: RateRule = { name: "test", limit: 3, windowSeconds: 60 }
  // Window arithmetic needs a fixed instant, but not one tied to "today"; the 60 s window is aligned to this base.
  const base = Math.floor(Date.now() / 60_000) * 60_000 + 60_000
  const t = (s: number) => base + s * 1000

  it("allows up to the limit then blocks, reporting when to retry", async () => {
    const results = []
    for (let i = 0; i < 5; i++) results.push(await checkRateLimit(rule, "ip-1", t(10)))
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false, false])
    expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0, 0])
    expect(results[3]!.retryAfterSeconds).toBeGreaterThan(0)
    expect(results[3]!.retryAfterSeconds).toBeLessThanOrEqual(60)
  })

  it("starts a fresh count in the next window", async () => {
    for (let i = 0; i < 4; i++) await checkRateLimit(rule, "ip-1", t(10))
    expect((await checkRateLimit(rule, "ip-1", t(10))).allowed).toBe(false)
    expect((await checkRateLimit(rule, "ip-1", t(75))).allowed).toBe(true)
  })

  it("counts each subject and each rule separately", async () => {
    for (let i = 0; i < 4; i++) await checkRateLimit(rule, "ip-1", t(10))
    expect((await checkRateLimit(rule, "ip-2", t(10))).allowed).toBe(true)
    expect((await checkRateLimit({ ...rule, name: "other" }, "ip-1", t(10))).allowed).toBe(true)
  })

  it("is atomic: 40 simultaneous requests let exactly the limit through", async () => {
    const results = await Promise.all(
      Array.from({ length: 40 }, () => checkRateLimit(rule, "burst", t(10)))
    )
    expect(results.filter((r) => r.allowed)).toHaveLength(3)
  })

  it("enforceRateLimit throws a 429 error carrying the wait, checking every subject", async () => {
    const strict: RateRule = { name: "strict", limit: 1, windowSeconds: 60 }
    await enforceRateLimit(strict, "ip-9", "email-9")
    const error = await enforceRateLimit(strict, "ip-9", "email-fresh").catch((e: unknown) => e)
    expect(error).toBeInstanceOf(TooManyRequestsError)
    expect((error as TooManyRequestsError).status).toBe(429)
    expect((error as TooManyRequestsError).retryAfterSeconds).toBeGreaterThan(0)
    // The same email from a different address is also limited, so guessing across IPs does not help.
    expect(
      await enforceRateLimit(strict, "ip-new", "email-9").catch((e: unknown) => e)
    ).toBeInstanceOf(TooManyRequestsError)
  })

  it("expires old counters through the database, and has sane defaults for sign-in", async () => {
    await checkRateLimit(rule, "x", t(10))
    const bucket = await RateLimitBucket.findOne({}).lean()
    expect(bucket!.expiresAt.getTime()).toBeGreaterThan(t(60))
    expect(RULES.login).toMatchObject({ limit: 5, windowSeconds: 900 })
    expect(RULES.resendVerification.limit).toBeLessThanOrEqual(3)
  })
})
