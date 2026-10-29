import { connection } from "next/server"
import { pingDb } from "@/lib/db/mongoose"

/**
 * Liveness/readiness probe for uptime monitors. Reports only whether dependencies respond. It never
 * returns configuration, versions, hostnames or error detail.
 */
export async function GET() {
  await connection() // opt out of prerendering: this must reflect live state on every request
  const db = await pingDb()
  return Response.json(
    { status: db.ok ? "ok" : "degraded", checks: { database: db.ok ? "up" : "down" } },
    { status: db.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  )
}
