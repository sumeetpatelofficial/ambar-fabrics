import type { NextRequest } from "next/server"
import { connection } from "next/server"
import { getSessionUser, toActor } from "@/lib/auth/session"
import { ForbiddenError } from "@/lib/errors"
import { isReportKind, parseReportRange, reportCsv } from "@/services/report-service"

/** One report as a spreadsheet. Staff with report access only; anyone else gets a plain 404, as for any hidden page. */
export async function GET(request: NextRequest) {
  await connection()
  const user = await getSessionUser()
  if (!user) return new Response("Not found", { status: 404 })
  const params = request.nextUrl.searchParams
  const kind = params.get("report")
  if (!isReportKind(kind)) return new Response("Not found", { status: 404 })
  try {
    const range = parseReportRange({
      from: params.get("from") ?? undefined,
      to: params.get("to") ?? undefined,
    })
    const { filename, csv } = await reportCsv(toActor(user), kind, range)
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    if (error instanceof ForbiddenError) return new Response("Not found", { status: 404 })
    throw error
  }
}
