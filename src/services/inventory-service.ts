import "server-only"
import mongoose from "mongoose"
import { connectDb } from "@/lib/db/mongoose"
import { AppError, ValidationError } from "@/lib/errors"
import { InventoryMovement, type MovementType } from "@/models/inventory-movement"
import {
  InventoryReservation,
  type InventoryReservationDoc,
  type ReservationStatus,
} from "@/models/inventory-reservation"
import { ProductVariant } from "@/models/product-variant"
import type { Id } from "@/models/_shared"

/**
 * Stock changes. Every change is one conditional update on the variant (never read, then write) plus a
 * movement row, and each operation that touches several variants runs in a transaction so it applies
 * completely or not at all. Quantities are whole numbers in the variant's base unit.
 */

export const DEFAULT_RESERVATION_MINUTES = 20

export class InsufficientStockError extends AppError {
  constructor(readonly variantId: string) {
    super("INSUFFICIENT_STOCK", "There is not enough stock for one of the items.", 409, {
      variantId,
    })
    this.name = "InsufficientStockError"
  }
}

export type StockLine = { variantId: Id | string; qty: number }

const trusted = mongoose.trusted
const oid = (id: Id | string) => new mongoose.Types.ObjectId(String(id))

function assertLines(lines: StockLine[]) {
  if (lines.length === 0) throw new ValidationError("There is nothing to reserve.")
  const seen = new Set<string>()
  for (const l of lines) {
    if (!Number.isSafeInteger(l.qty) || l.qty <= 0)
      throw new ValidationError("Quantities must be whole numbers above zero.")
    const key = String(l.variantId)
    if (seen.has(key)) throw new ValidationError("Each item can appear only once.")
    seen.add(key)
  }
}

/** Fixed order (by variant id) so two orders reserving the same items cannot wait on each other. */
const sorted = (lines: StockLine[]) =>
  [...lines].sort((a, b) => String(a.variantId).localeCompare(String(b.variantId)))

type Applied = { variantId: Id | string; deltaOnHand: number; deltaReserved: number }

/**
 * Applies one stock change when `guard` holds, and records it. Returns false (changing nothing) when the
 * guard fails. A repeated idempotency key throws, which aborts the surrounding transaction.
 */
async function applyChange(
  session: mongoose.ClientSession,
  change: Applied & {
    guard: Record<string, unknown>
    type: MovementType
    key: string
    orderId?: Id | string
    actorId?: Id | string
    reason?: string
  }
): Promise<boolean> {
  const after = await ProductVariant.findOneAndUpdate(
    { _id: oid(change.variantId), ...change.guard },
    { $inc: { "stock.onHand": change.deltaOnHand, "stock.reserved": change.deltaReserved } },
    { session, returnDocument: "after", timestamps: false }
  ).lean<{ stock: { onHand: number; reserved: number } }>()
  if (!after) return false
  await InventoryMovement.create(
    [
      {
        variantId: oid(change.variantId),
        type: change.type,
        deltaOnHand: change.deltaOnHand,
        deltaReserved: change.deltaReserved,
        onHandAfter: after.stock.onHand,
        reservedAfter: after.stock.reserved,
        orderId: change.orderId ? oid(change.orderId) : undefined,
        actorId: change.actorId ? oid(change.actorId) : undefined,
        reason: change.reason,
        idempotencyKey: change.key,
      },
    ],
    { session }
  )
  return true
}

async function inTransaction<T>(work: (session: mongoose.ClientSession) => Promise<T>): Promise<T> {
  await connectDb()
  const session = await mongoose.startSession()
  try {
    return await session.withTransaction(() => work(session))
  } finally {
    await session.endSession()
  }
}

// ------------------------------------------------------------------ reservations

/**
 * Holds stock for an order. All lines or none. Calling it again for the same order returns the
 * reservation already made, so a retried request cannot reserve twice.
 */
export async function reserveStock(
  orderId: Id | string,
  lines: StockLine[],
  options: { minutes?: number; now?: Date } = {}
): Promise<InventoryReservationDoc> {
  assertLines(lines)
  const now = options.now ?? new Date()
  const expiresAt = new Date(
    now.getTime() + (options.minutes ?? DEFAULT_RESERVATION_MINUTES) * 60_000
  )
  await connectDb()
  const existing = await InventoryReservation.findOne({
    orderId: oid(orderId),
  }).lean<InventoryReservationDoc>()
  if (existing) return existing

  return inTransaction(async (session) => {
    for (const line of sorted(lines)) {
      const ok = await applyChange(session, {
        variantId: line.variantId,
        deltaOnHand: 0,
        deltaReserved: line.qty,
        type: "reserve",
        key: `reserve:${orderId}:${line.variantId}`,
        orderId,
        // available = onHand - reserved must stay at or above the quantity asked for.
        guard: {
          $expr: trusted({
            $gte: [{ $subtract: ["$stock.onHand", "$stock.reserved"] }, line.qty],
          }),
        },
      })
      if (!ok) throw new InsufficientStockError(String(line.variantId))
    }
    const [created] = await InventoryReservation.create(
      [
        {
          orderId: oid(orderId),
          lines: sorted(lines).map((l) => ({ variantId: oid(l.variantId), qty: l.qty })),
          status: "active",
          expiresAt,
        },
      ],
      { session }
    )
    return created!.toObject() as InventoryReservationDoc
  })
}

/** Moves an active reservation to its end state and applies the stock change; one winner if called twice. */
async function settle(
  orderId: Id | string,
  to: Exclude<ReservationStatus, "active">,
  options: { dueBefore?: Date } = {}
): Promise<boolean> {
  return inTransaction(async (session) => {
    const claimed = await InventoryReservation.findOneAndUpdate(
      {
        orderId: oid(orderId),
        status: "active",
        // Expiry re-checks the deadline inside the claim: a hold extended after it was listed stays.
        ...(options.dueBefore ? { expiresAt: trusted({ $lte: options.dueBefore }) } : {}),
      },
      { $set: { status: to } },
      { session, returnDocument: "before" }
    ).lean<InventoryReservationDoc>()
    if (!claimed) return false
    for (const line of sorted(claimed.lines)) {
      const committing = to === "committed"
      const ok = await applyChange(session, {
        variantId: line.variantId,
        deltaOnHand: committing ? -line.qty : 0,
        deltaReserved: -line.qty,
        type: committing ? "commit" : "release",
        key: `${committing ? "commit" : "release"}:${orderId}:${line.variantId}`,
        orderId,
        guard: committing
          ? {
              "stock.reserved": trusted({ $gte: line.qty }),
              "stock.onHand": trusted({ $gte: line.qty }),
            }
          : { "stock.reserved": trusted({ $gte: line.qty }) },
      })
      // The guard failing means stock was changed behind our back; stop rather than guess.
      if (!ok) throw new AppError("STOCK_INVARIANT", "Stock records do not match.", 500)
    }
    return true
  })
}

/**
 * Takes a finished hold back (the customer paid after it expired or was released) when the stock is still
 * there. Throws InsufficientStockError, changing nothing, when it is not. Returns false when there is no
 * finished hold to revive.
 */
export async function reviveReservation(
  orderId: Id | string,
  options: { minutes?: number; now?: Date } = {}
): Promise<boolean> {
  const now = options.now ?? new Date()
  return inTransaction(async (session) => {
    const claimed = await InventoryReservation.findOneAndUpdate(
      { orderId: oid(orderId), status: trusted({ $in: ["expired", "released"] }) },
      {
        $set: {
          status: "active",
          expiresAt: new Date(now.getTime() + (options.minutes ?? 5) * 60_000),
        },
      },
      { session, returnDocument: "before" }
    ).lean<InventoryReservationDoc>()
    if (!claimed) return false
    for (const line of sorted(claimed.lines)) {
      const ok = await applyChange(session, {
        variantId: line.variantId,
        deltaOnHand: 0,
        deltaReserved: line.qty,
        type: "reserve",
        key: `revive:${orderId}:${line.variantId}`,
        orderId,
        guard: {
          $expr: trusted({ $gte: [{ $subtract: ["$stock.onHand", "$stock.reserved"] }, line.qty] }),
        },
      })
      if (!ok) throw new InsufficientStockError(String(line.variantId))
    }
    return true
  })
}

/** Payment captured: the held stock leaves the shelf. Returns false when there was no active hold. */
export const commitReservation = (orderId: Id | string) => settle(orderId, "committed")

/** Payment failed or the customer left: the held stock becomes available again. */
export const releaseReservation = (orderId: Id | string) => settle(orderId, "released")

/** Releases every hold that has run out. Safe to run from several workers at once. */
export async function expireDueReservations(now = new Date(), limit = 100): Promise<number> {
  await connectDb()
  const due = await InventoryReservation.find({
    status: "active",
    expiresAt: trusted({ $lte: now }),
  })
    .sort({ expiresAt: 1 })
    .limit(limit)
    .select({ orderId: 1 })
    .lean<{ orderId: Id }[]>()
  let released = 0
  for (const r of due) {
    const done = await settle(r.orderId, "expired", { dueBefore: now })
    if (done) released += 1
  }
  return released
}

// ------------------------------------------------------------------ admin and returns

/**
 * Changes stock on hand by a signed amount (stock received, a recount, wastage, a returned item put
 * back). Refuses a change that would take on-hand stock below what is already held for orders.
 */
export async function adjustStock(input: {
  variantId: Id | string
  delta: number
  type: Extract<MovementType, "adjust" | "restock" | "wastage" | "correction">
  reason: string
  idempotencyKey: string
  actorId?: Id | string
  orderId?: Id | string
}): Promise<void> {
  if (!Number.isSafeInteger(input.delta) || input.delta === 0)
    throw new ValidationError("The change must be a whole number other than zero.")
  let ok: boolean
  try {
    ok = await inTransaction((session) =>
      applyChange(session, {
        variantId: input.variantId,
        deltaOnHand: input.delta,
        deltaReserved: 0,
        type: input.type,
        key: input.idempotencyKey,
        orderId: input.orderId,
        actorId: input.actorId,
        reason: input.reason,
        guard: {
          $expr: trusted({
            $gte: [{ $add: ["$stock.onHand", input.delta] }, "$stock.reserved"],
          }),
        },
      })
    )
  } catch (error) {
    // The same operation sent twice: the first one already applied.
    if ((error as { code?: number }).code === 11000) return
    throw error
  }
  if (!ok) throw new ValidationError("That would take stock below what is held for open orders.")
}
