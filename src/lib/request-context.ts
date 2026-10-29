import "server-only"
import { headers } from "next/headers"
import { clientIp } from "@/lib/security/rate-limit"

export type RequestContext = { ip: string; userAgent?: string; requestId?: string }

/** Who is calling, for audit logs and rate limits. Reads request headers, so call it inside a request. */
export async function getRequestContext(): Promise<RequestContext> {
  const h = await headers()
  return {
    ip: clientIp(h),
    userAgent: h.get("user-agent")?.slice(0, 300) ?? undefined,
    requestId: h.get("x-request-id")?.slice(0, 64) ?? undefined,
  }
}
