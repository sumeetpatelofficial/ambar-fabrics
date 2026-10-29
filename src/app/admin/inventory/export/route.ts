import { connection } from "next/server"
import { getSessionUser, toActor } from "@/lib/auth/session"
import { ForbiddenError } from "@/lib/errors"
import { exportStockCsv } from "@/services/admin-ops-service"

/** The stock sheet. Staff with inventory access only; anyone else gets a plain 404, as for any hidden page. */
export async function GET() {
  await connection()
  const user = await getSessionUser()
  if (!user) return new Response("Not found", { status: 404 })
  try {
    const csv = await exportStockCsv(toActor(user))
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="ambar-stock.csv"',
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    if (error instanceof ForbiddenError) return new Response("Not found", { status: 404 })
    throw error
  }
}
