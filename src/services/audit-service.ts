import "server-only"
import { connectDb } from "@/lib/db/mongoose"
import { logger } from "@/lib/logger"
import type { Actor } from "@/lib/security/authorize"
import { AuditLog } from "@/models/audit-log"

export type AuditContext = { ip?: string; userAgent?: string; requestId?: string }

/**
 * Records a sensitive action. Auditing must never be the reason a legitimate action fails, so a write
 * failure is logged loudly instead of thrown. `details` must not contain secrets or personal data beyond
 * what is needed to understand the event.
 */
export async function recordAudit(input: {
  action: string
  actor?: Actor | null
  entityType?: string
  entityId?: string
  details?: Record<string, unknown>
  context?: AuditContext
}): Promise<void> {
  try {
    await connectDb()
    await AuditLog.create({
      action: input.action,
      actorId: input.actor?.id ?? null,
      actorRole: input.actor?.role,
      entityType: input.entityType,
      entityId: input.entityId,
      details: input.details,
      ip: input.context?.ip,
      userAgent: input.context?.userAgent,
      requestId: input.context?.requestId,
    })
  } catch (error) {
    logger.error(
      {
        event: "audit.write_failed",
        action: input.action,
        errorName: error instanceof Error ? error.name : "UnknownError",
      },
      "Audit log write failed"
    )
  }
}
