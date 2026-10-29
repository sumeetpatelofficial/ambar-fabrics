import { connection, type NextRequest } from "next/server"
import { getServerEnv } from "@/lib/env/server"
import { safeEqual } from "@/lib/security/tokens"
import { expireDueReservations } from "@/services/inventory-service"
import { drainJobs } from "@/services/job-service"
import { expirePendingOrders } from "@/services/order-service"
import { closeReturnWindows, syncActiveShipments } from "@/services/shipping-service"

/**
 * Scheduled worker: expires unpaid orders, releases stale stock holds and sends queued emails (with retries). Called by the platform's cron with
 * `Authorization: Bearer $CRON_SECRET`. Safe to call repeatedly or from several places at once.
 */
export async function GET(request: NextRequest) {
  await connection()
  const secret = getServerEnv().CRON_SECRET
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? ""
  // Refuse when no secret is configured: an open cron endpoint would let anyone trigger work.
  if (!secret || !safeEqual(given, secret))
    return Response.json(
      { error: { code: "UNAUTHENTICATED", message: "Unauthorized." } },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    )
  // Unpaid orders first (they check with the gateway before giving stock back), then any stray holds, then email.
  const expiredOrders = await expirePendingOrders()
  const releasedHolds = await expireDueReservations()
  // Catch up on courier updates (a webhook may have been missed), then close return windows that have passed.
  const shipmentsMoved = await syncActiveShipments()
  const ordersCompleted = await closeReturnWindows()
  const emails = await drainJobs({ limit: 50 })
  return Response.json(
    { data: { ...emails, expiredOrders, releasedHolds, shipmentsMoved, ordersCompleted } },
    { headers: { "Cache-Control": "no-store" } }
  )
}
