import "server-only"
import mongoose from "mongoose"
import { connectDb } from "@/lib/db/mongoose"
import { getEmailProvider } from "@/lib/email/providers"
import type { EmailMessage } from "@/lib/email/types"
import { logger, maskConnectionString } from "@/lib/logger"
import { Job, type JobDoc } from "@/models/job"

export const MAX_ATTEMPTS = 8
const LOCK_MS = 5 * 60_000

/** Retry delay: 30 s, 1 min, 2 min ... capped at one hour. */
export function backoffMs(attempts: number): number {
  return Math.min(60 * 60_000, 30_000 * 2 ** Math.max(0, attempts - 1))
}

/** Queue an email. The same `dedupeKey` is never queued twice, so a repeated request cannot send two emails. */
export async function enqueueEmail(message: EmailMessage, dedupeKey: string): Promise<void> {
  await connectDb()
  try {
    await Job.create({ type: "email", payload: message, dedupeKey })
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return // already queued
    throw error
  }
}

/**
 * Process due jobs. Each job is claimed with one atomic update, so two workers (or a cron overlapping an
 * inline run) never send the same email twice. Failures retry with backoff, then become "dead" for
 * attention. Returns counts for the cron response and tests.
 */
export async function drainJobs(
  opts: { limit?: number; now?: Date } = {}
): Promise<{ sent: number; failed: number; dead: number }> {
  await connectDb()
  const now = opts.now ?? new Date()
  const result = { sent: 0, failed: 0, dead: 0 }

  for (let i = 0; i < (opts.limit ?? 20); i++) {
    const job = await Job.findOneAndUpdate(
      {
        status: mongoose.trusted({ $in: ["queued", "failed"] }),
        runAt: mongoose.trusted({ $lte: now }),
        $or: [{ lockedUntil: null }, { lockedUntil: mongoose.trusted({ $lt: now }) }],
      },
      {
        $set: { status: "running", lockedUntil: new Date(now.getTime() + LOCK_MS) },
        $inc: { attempts: 1 },
      },
      { sort: { runAt: 1 }, returnDocument: "after" }
    ).lean<JobDoc>()
    if (!job) break

    try {
      await getEmailProvider().send(job.payload as unknown as EmailMessage)
      // Message bodies hold one-time links. Once sent they are not needed, so they are not kept
      // (the browser-test server keeps them so tests can read the link).
      const keep = process.env.ENABLE_DEV_PAGES === "1"
      await Job.updateOne(
        { _id: job._id },
        {
          $set: {
            status: "done",
            doneAt: new Date(),
            lockedUntil: null,
            ...(keep ? {} : { "payload.html": "[removed]", "payload.text": "[removed]" }),
          },
        }
      )
      result.sent++
    } catch (error) {
      const dead = job.attempts >= MAX_ATTEMPTS
      await Job.updateOne(
        { _id: job._id },
        {
          $set: {
            status: dead ? "dead" : "failed",
            runAt: new Date(now.getTime() + backoffMs(job.attempts)),
            lockedUntil: null,
            lastError: maskConnectionString(
              error instanceof Error ? error.message : String(error)
            ).slice(0, 300),
            ...(dead ? { doneAt: new Date() } : {}),
          },
        }
      )
      logger.warn(
        { event: "job.failed", jobId: job._id.toString(), attempts: job.attempts, dead },
        "Email job failed"
      )
      if (dead) result.dead++
      else result.failed++
    }
  }
  return result
}

/** Test support: recent emails queued for an address, newest first. Used only by the dev mailbox route. */
export async function recentEmailsFor(
  to: string,
  template?: string
): Promise<{ template?: string; text?: string; status: string }[]> {
  await connectDb()
  const jobs = await Job.find({
    type: "email",
    "payload.to": to,
    ...(template ? { "payload.template": template } : {}),
  })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean<JobDoc[]>()
  return jobs.map((j) => ({
    template: (j.payload as { template?: string }).template,
    text: (j.payload as { text?: string }).text,
    status: j.status,
  }))
}
