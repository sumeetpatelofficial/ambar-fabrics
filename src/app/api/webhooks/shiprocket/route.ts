import { connection, type NextRequest } from "next/server"
import { handleShippingWebhook } from "@/services/shipping-service"

/** The courier's tracking updates. Authenticated by the token set with the courier; nothing is cached or echoed. */
export async function POST(request: NextRequest) {
  await connection()
  const rawBody = await request.text()
  if (rawBody.length > 100_000)
    return Response.json(
      { error: "too large" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    )
  const result = await handleShippingWebhook({ rawBody, headers: request.headers })
  return Response.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  })
}
