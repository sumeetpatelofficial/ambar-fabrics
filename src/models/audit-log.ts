import { Schema } from "mongoose"
import { modelFor, type Id } from "./_shared"

/** Append-only record of sensitive actions. There is deliberately no update or delete code path. */
export interface AuditLogDoc {
  _id: Id
  actorId?: Id | null
  actorRole?: string
  /** Dotted action name such as "auth.password_changed" or "user.role_changed". */
  action: string
  entityType?: string
  entityId?: string
  /** Redacted before/after values or small context. Never secrets, tokens or password hashes. */
  details?: Record<string, unknown>
  ip?: string
  userAgent?: string
  requestId?: string
  at: Date
}

const schema = new Schema<AuditLogDoc>({
  actorId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  actorRole: { type: String, maxlength: 30 },
  action: { type: String, required: true, maxlength: 80 },
  entityType: { type: String, maxlength: 40 },
  entityId: { type: String, maxlength: 64 },
  details: { type: Schema.Types.Mixed },
  ip: { type: String, maxlength: 64 },
  userAgent: { type: String, maxlength: 300 },
  requestId: { type: String, maxlength: 64 },
  at: { type: Date, default: () => new Date(), required: true },
})

schema.index({ entityType: 1, entityId: 1, at: -1 })
schema.index({ actorId: 1, at: -1 })
schema.index({ action: 1, at: -1 })

export const AuditLog = modelFor<AuditLogDoc>("AuditLog", schema)
