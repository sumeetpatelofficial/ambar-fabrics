import { connection, type NextRequest } from "next/server"
import { handleRazorpayWebhook } from "@/services/webhook-service"

/**
 * Razorpay calls this after a payment or refund. It reads the body as text because the signature is over the exact
 * bytes sent; parsing first would change them. Nothing here is cached, and the response never echoes the input.
 */
export async function POST(request: NextRequest) {
  await connection()
  const rawBody = await request.text()
  if (rawBody.length > 100_000)
    return Response.json(
      { error: "too large" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    )
  const result = await handleRazorpayWebhook({
    rawBody,
    signature: request.headers.get("x-razorpay-signature"),
    eventId: request.headers.get("x-razorpay-event-id"),
  })
  return Response.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  })
}
