import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { MongoMemoryReplSet } from "mongodb-memory-server"

// Runs against a real mongod (single-node replica set), the same topology as docker-compose and Atlas.
let replSet: MongoMemoryReplSet

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } })
  vi.stubEnv("MONGODB_URI", replSet.getUri("ambar_test"))
}, 180_000)

afterAll(async () => {
  const { default: mongoose } = await import("mongoose")
  await mongoose.disconnect()
  await replSet?.stop()
  vi.unstubAllEnvs()
})

describe("MongoDB connection (real server)", () => {
  it("connects, pings, and reuses the connection", async () => {
    const { connectDb, pingDb } = await import("@/lib/db/mongoose")
    const first = await connectDb()
    const second = await connectDb()
    expect(second).toBe(first)
    expect(first.connection.readyState).toBe(1)
    const ping = await pingDb()
    expect(ping.ok).toBe(true)
    expect(ping.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it("supports multi-document transactions (replica set)", async () => {
    const { connectDb } = await import("@/lib/db/mongoose")
    const { connection } = await connectDb()
    const session = await connection.startSession()
    try {
      await session.withTransaction(async () => {
        await connection.collection("tx_probe").insertOne({ ok: true }, { session })
      })
    } finally {
      await session.endSession()
    }
    expect(await connection.collection("tx_probe").countDocuments()).toBe(1)
  })

  it("never lets operator injection through a filter", async () => {
    const { default: mongoose } = await import("mongoose")
    const Probe = mongoose.model(
      "Probe",
      new mongoose.Schema({ email: String, meta: mongoose.Schema.Types.Mixed })
    )
    await Probe.create({ email: "a@example.com", meta: { tier: "gold" } })

    // Typed path: { $ne: null } is rejected outright (cast error) or matches nothing, never everything.
    const typed = { email: { $ne: null } } as unknown as { email: string }
    expect(
      await Probe.find(typed).then(
        (r) => r,
        () => []
      )
    ).toHaveLength(0)

    // Untyped (Mixed) path: only sanitizeFilter stops the operator, turning it into a literal $eq.
    const untyped = { meta: { $ne: null } } as unknown as { meta: unknown }
    expect(await Probe.find(untyped)).toHaveLength(0)
    // Sanity check: a legitimate equality filter still works.
    expect(await Probe.find({ email: "a@example.com" })).toHaveLength(1)
  })
})
