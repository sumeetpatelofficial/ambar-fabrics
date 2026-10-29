import { connection, type NextRequest } from "next/server"
import { recentEmailsFor } from "@/services/job-service"

/**
 * Test-only: lets the browser tests read the emails the app "sent" (the console provider prints nothing
 * useful). It exists only when ENABLE_DEV_PAGES=1, which only the test server sets; elsewhere it is a 404.
 */
export async function GET(request: NextRequest) {
  await connection()
  if (process.env.ENABLE_DEV_PAGES !== "1") return new Response(null, { status: 404 })
  const to = request.nextUrl.searchParams.get("to")
  if (!to) return Response.json({ error: "to is required" }, { status: 400 })
  const data = await recentEmailsFor(to, request.nextUrl.searchParams.get("template") ?? undefined)
  return Response.json({ data }, { headers: { "Cache-Control": "no-store" } })
}
