import {
  isStaff,
  ROLE_RANK,
  roleHasPermission,
  type Permission,
  type Role,
} from "@/config/permissions"
import { ForbiddenError, NotFoundError, UnauthorizedError } from "@/lib/errors"

/** Who is acting. Always built from the database record, never from a client-supplied value. */
export type Actor = { id: string; role: Role; email?: string }

export function assertSignedIn(actor: Actor | null | undefined): asserts actor is Actor {
  if (!actor) throw new UnauthorizedError()
}

/** Every protected operation starts with this. Hiding a link is cosmetic; this is the control. */
export function assertPermission(
  actor: Actor | null | undefined,
  permission: Permission
): asserts actor is Actor {
  assertSignedIn(actor)
  if (!roleHasPermission(actor.role, permission)) throw new ForbiddenError()
}

export function assertStaff(actor: Actor | null | undefined): asserts actor is Actor {
  assertSignedIn(actor)
  if (!isStaff(actor.role)) throw new ForbiddenError()
}

/**
 * Customers may only touch their own records. A miss is "not found", not "forbidden", so the answer
 * does not reveal whether someone else's record exists.
 */
export function assertOwnership(
  actor: Actor,
  ownerId: { toString(): string } | null | undefined
): void {
  if (!ownerId || ownerId.toString() !== actor.id) throw new NotFoundError()
}

/** Nobody may grant a role above their own. */
export function assertCanGrant(actor: Actor, target: Role): void {
  if (ROLE_RANK[target] > ROLE_RANK[actor.role])
    throw new ForbiddenError("You cannot grant a role above your own.")
}
