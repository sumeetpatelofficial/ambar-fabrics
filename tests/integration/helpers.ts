import { MongoMemoryReplSet } from "mongodb-memory-server"
import mongoose from "mongoose"
import { vi } from "vitest"

/** Starts a throwaway replica set and points the app at it. Call from beforeAll; stop from afterAll. */
export async function startDatabase(name: string): Promise<MongoMemoryReplSet> {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } })
  vi.stubEnv("MONGODB_URI", replSet.getUri(name))
  const { connectDb } = await import("@/lib/db/mongoose")
  await connectDb()
  return replSet
}

export async function stopDatabase(replSet: MongoMemoryReplSet | undefined) {
  await mongoose.disconnect()
  await replSet?.stop()
  vi.unstubAllEnvs()
}

/** Empties every collection (indexes stay), so each test starts from nothing. */
export async function resetDatabase() {
  const collections = await mongoose.connection.db!.collections()
  await Promise.all(collections.map((c) => c.deleteMany({})))
}

export type QueuedEmail = {
  to: string
  subject: string
  text: string
  html: string
  template: string
}

/** Emails waiting in the outbox, newest last. Tests read links from here instead of from a real inbox. */
export async function queuedEmails(
  filter: { template?: string; to?: string } = {}
): Promise<QueuedEmail[]> {
  const { Job } = await import("@/models/job")
  const query: Record<string, unknown> = { type: "email" }
  if (filter.template) query["payload.template"] = filter.template
  if (filter.to) query["payload.to"] = filter.to
  const jobs = await Job.find(query).sort({ createdAt: 1, _id: 1 }).lean()
  return jobs.map((j) => j.payload as unknown as QueuedEmail)
}

/** The one-time token in the most recent email's link. */
export async function latestToken(
  template: "verify_email" | "password_reset",
  to: string
): Promise<string> {
  const emails = await queuedEmails({ template, to })
  const email = emails.at(-1)
  if (!email) throw new Error(`no ${template} email queued for ${to}`)
  const match = /[?&]token=([^&\s"]+)/.exec(email.text)
  if (!match?.[1]) throw new Error("no token in email")
  return decodeURIComponent(match[1])
}
