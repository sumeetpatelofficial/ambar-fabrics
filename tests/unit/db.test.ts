import { beforeEach, describe, expect, it, vi } from "vitest"

const connect = vi.fn()
vi.mock("mongoose", () => ({
  default: { set: vi.fn(), connect: (...args: unknown[]) => connect(...args) },
}))

async function load() {
  vi.resetModules()
  ;(globalThis as { __mongoose?: unknown }).__mongoose = undefined
  vi.stubEnv("MONGODB_URI", "mongodb://user:pw@localhost:27017/test")
  return import("@/lib/db/mongoose")
}

describe("connectDb", () => {
  beforeEach(() => vi.unstubAllEnvs())

  it("surfaces failures as a generic error and retries on the next call", async () => {
    connect.mockRejectedValueOnce(
      new Error("connect ECONNREFUSED mongodb://user:pw@localhost:27017")
    )
    const { connectDb } = await load()
    const { DatabaseUnavailableError } = await import("@/lib/errors")

    const failure = await connectDb().catch((e: unknown) => e)
    expect(failure).toBeInstanceOf(DatabaseUnavailableError)
    expect((failure as Error).message).not.toMatch(/ECONNREFUSED|pw|localhost/)

    const connected = { connection: { readyState: 1 } }
    connect.mockResolvedValueOnce(connected)
    await expect(connectDb()).resolves.toBe(connected)
    expect(connect).toHaveBeenCalledTimes(2)
  })

  it("reuses an open connection", async () => {
    const connected = { connection: { readyState: 1 } }
    connect.mockResolvedValue(connected)
    const { connectDb } = await load()
    await connectDb()
    await connectDb()
    expect(connect).toHaveBeenCalledTimes(1)
  })

  it("throws a configuration error, not a network error, when the URI is missing", async () => {
    const { connectDb } = await load()
    vi.stubEnv("MONGODB_URI", "")
    vi.resetModules()
    ;(globalThis as { __mongoose?: unknown }).__mongoose = undefined
    const mod = await import("@/lib/db/mongoose")
    const { ConfigError } = await import("@/lib/errors")
    await expect(mod.connectDb()).rejects.toBeInstanceOf(ConfigError)
    expect(connect).not.toHaveBeenCalled()
    void connectDb
  })

  it("pingDb reports down instead of throwing", async () => {
    connect.mockRejectedValue(new Error("boom"))
    const { pingDb } = await load()
    await expect(pingDb()).resolves.toEqual({ ok: false })
  })
})
