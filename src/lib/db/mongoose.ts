import "server-only"
import mongoose from "mongoose"
import { DatabaseUnavailableError } from "@/lib/errors"
import { logger, maskConnectionString } from "@/lib/logger"
import { getServerEnv, requireGroup } from "@/lib/env/server"

mongoose.set("strictQuery", true)
// Rejects query operators ($ne, $gt, ...) smuggled in through user-controlled filter values.
mongoose.set("sanitizeFilter", true)

type Cache = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null }

// Cached on globalThis so dev hot reloads and warm serverless instances reuse one pool.
const globalCache = globalThis as typeof globalThis & { __mongoose?: Cache }
const cache: Cache = (globalCache.__mongoose ??= { conn: null, promise: null })

/**
 * Connect once and reuse. Failures are logged in detail but surface only as a generic
 * `DatabaseUnavailableError`, and the failed attempt is not cached so the next call retries.
 */
export async function connectDb(): Promise<typeof mongoose> {
  if (cache.conn?.connection.readyState === 1) return cache.conn

  if (!cache.promise) {
    const { MONGODB_URI } = requireGroup("database")
    cache.promise = mongoose.connect(MONGODB_URI, {
      maxPoolSize: 5, // small on purpose: many serverless instances share one Atlas cluster
      serverSelectionTimeoutMS: 5_000,
      socketTimeoutMS: 45_000,
      bufferCommands: false, // fail fast instead of queueing operations while disconnected
      autoIndex: getServerEnv().NODE_ENV !== "production", // production indexes via scripts/create-indexes
    })
  }

  try {
    cache.conn = await cache.promise
    return cache.conn
  } catch (error) {
    cache.promise = null
    cache.conn = null
    logger.error(
      {
        event: "db.connect_failed",
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: maskConnectionString(error instanceof Error ? error.message : String(error)),
      },
      "MongoDB connection failed"
    )
    throw new DatabaseUnavailableError()
  }
}

/** Lightweight liveness probe for the health endpoint. Never throws. */
export async function pingDb(): Promise<{ ok: boolean; latencyMs?: number }> {
  const started = performance.now()
  try {
    const db = (await connectDb()).connection.db
    await db?.admin().ping()
    return { ok: true, latencyMs: Math.round(performance.now() - started) }
  } catch (error) {
    // DatabaseUnavailableError was already logged with detail by connectDb; log anything else here
    // (missing configuration, dropped connection) so "down" is never a silent state.
    if (!(error instanceof DatabaseUnavailableError)) {
      logger.warn(
        {
          event: "db.ping_failed",
          errorName: error instanceof Error ? error.name : "UnknownError",
          errorMessage: maskConnectionString(
            error instanceof Error ? error.message : String(error)
          ),
        },
        "MongoDB ping failed"
      )
    }
    return { ok: false }
  }
}
