import "server-only"
import mongoose from "mongoose"
import type { Role } from "@/config/permissions"
import { connectDb } from "@/lib/db/mongoose"
import {
  accountExistsMessage,
  googleLinkedMessage,
  passwordChangedMessage,
  passwordResetMessage,
  verifyEmailMessage,
} from "@/lib/email/templates"
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors"
import { checkPassword, PASSWORD_MESSAGES } from "@/lib/security/password-policy"
import { burnPasswordCheck, hashPassword, verifyPassword } from "@/lib/security/password"
import { assertCanGrant, assertPermission, type Actor } from "@/lib/security/authorize"
import { generateToken, hashToken } from "@/lib/security/tokens"
import { AuthAccount } from "@/models/auth-account"
import { AuthToken } from "@/models/auth-token"
import { RateLimitBucket } from "@/models/rate-limit-bucket"
import { User, type UserDoc } from "@/models/user"
import { recordAudit, type AuditContext } from "@/services/audit-service"
import { enqueueEmail } from "@/services/job-service"

/**
 * Everything about who a person is and how they prove it. Pure functions of their inputs and the
 * database, so every flow can be tested without a browser. UI code (server actions, Auth.js callbacks)
 * is a thin layer on top. Rules that matter:
 *  - Nothing here reveals whether an email address is registered.
 *  - One-time tokens are stored hashed, expire, and are claimed atomically (single use).
 *  - Changing credentials bumps `sessionVersion`, which signs out every other device.
 */

// The database rejects operator objects in queries (injection guard) unless they are marked trusted here.
const trusted = mongoose.trusted

const VERIFY_TTL_MS = 24 * 3600_000
const RESET_TTL_MS = 3600_000

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

export type AuthUser = {
  id: string
  email: string
  name: string
  role: Role
  sessionVersion: number
  emailVerified: boolean
  hasPassword: boolean
}

function toAuthUser(u: UserDoc): AuthUser {
  return {
    id: u._id.toString(),
    email: u.email,
    name: u.name,
    role: u.role,
    sessionVersion: u.sessionVersion,
    emailVerified: Boolean(u.emailVerified),
    hasPassword: Boolean(u.passwordHash),
  }
}

function assertPasswordAllowed(
  password: string,
  context: { email?: string; name?: string },
  field = "password"
) {
  const problem = checkPassword(password, context)
  if (problem)
    throw new ValidationError(PASSWORD_MESSAGES[problem], [
      { path: field, issue: PASSWORD_MESSAGES[problem] },
    ])
}

async function issueToken(
  userId: mongoose.Types.ObjectId,
  purpose: "verify_email" | "reset_password",
  ttlMs: number,
  ip?: string
) {
  // Only the newest link works: issuing a new one retires any earlier unused link for the same purpose.
  await AuthToken.deleteMany({ userId, purpose, usedAt: null })
  const token = generateToken()
  await AuthToken.create({
    userId,
    purpose,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + ttlMs),
    requestIp: ip,
  })
  return token
}

/** Finds a live, unused token without consuming it. */
async function findLiveToken(token: string, purpose: "verify_email" | "reset_password") {
  if (typeof token !== "string" || token.length < 20 || token.length > 200) return null
  return AuthToken.findOne({
    tokenHash: hashToken(token),
    purpose,
    usedAt: null,
    expiresAt: trusted({ $gt: new Date() }),
  }).lean()
}

/** Consumes a token. Returns false if someone else used it first, which makes tokens single-use under races. */
async function claimToken(id: mongoose.Types.ObjectId): Promise<boolean> {
  const claimed = await AuthToken.findOneAndUpdate(
    { _id: id, usedAt: null },
    { $set: { usedAt: new Date() } }
  )
  return Boolean(claimed)
}

const INVALID_LINK = "This link is invalid or has expired. Request a new one."

// ------------------------------------------------------------------ registration and verification

/**
 * Create an account, or quietly do the right thing if the address is already known. The caller always
 * shows the same "check your email" message, so a visitor cannot probe which addresses are registered.
 */
export async function registerUser(
  input: { name: string; email: string; password: string },
  ctx: AuditContext = {}
): Promise<void> {
  await connectDb()
  const email = normalizeEmail(input.email)
  assertPasswordAllowed(input.password, { email, name: input.name })

  const existing = await User.findOne({ email }).select("+passwordHash")
  if (existing && existing.status === "active" && existing.emailVerified) {
    await burnPasswordCheck(input.password) // same cost as the other branches
    await hashPassword(input.password)
    // At most one notice per account per hour, so this cannot be used to flood someone's inbox.
    await enqueueEmail(
      accountExistsMessage({ to: email, name: existing.name }),
      `exists:${existing._id}:${Math.floor(Date.now() / 3600_000)}`
    )
    return
  }
  if (existing && existing.status !== "active") {
    await hashPassword(input.password)
    return // suspended or deleted accounts get no email and no change
  }

  const passwordHash = await hashPassword(input.password)
  let user = existing
  if (user) {
    // An unverified account is a claim nobody has proven. A new registration replaces its password, so a
    // squatter who pre-registered someone's address does not keep a working password.
    user.name = input.name.trim()
    user.passwordHash = passwordHash
    user.sessionVersion += 1
    await user.save()
  } else {
    try {
      user = await User.create({
        email,
        name: input.name.trim(),
        passwordHash,
        emailVerified: null,
        role: "customer",
      })
    } catch (error) {
      if ((error as { code?: number }).code === 11000) return // lost a race with another registration
      throw error
    }
  }
  const token = await issueToken(user._id, "verify_email", VERIFY_TTL_MS, ctx.ip)
  await enqueueEmail(
    verifyEmailMessage({ to: email, name: user.name, token }),
    `verify:${hashToken(token)}`
  )
  await recordAudit({
    action: "auth.registered",
    entityType: "user",
    entityId: user._id.toString(),
    context: ctx,
  })
}

export async function verifyEmail(token: string, ctx: AuditContext = {}): Promise<void> {
  await connectDb()
  const found = await findLiveToken(token, "verify_email")
  if (!found || !(await claimToken(found._id))) throw new ValidationError(INVALID_LINK)
  const user = await User.findOneAndUpdate(
    { _id: found.userId, status: "active" },
    { $set: { emailVerified: new Date() } }
  )
  if (!user) throw new ValidationError(INVALID_LINK)
  await recordAudit({
    action: "auth.email_verified",
    entityType: "user",
    entityId: user._id.toString(),
    context: ctx,
  })
}

/** Sends a fresh link to an unverified password account. Always looks the same from outside. */
export async function resendVerification(
  emailInput: string,
  ctx: AuditContext = {}
): Promise<void> {
  await connectDb()
  const email = normalizeEmail(emailInput)
  const user = await User.findOne({ email, status: "active", emailVerified: null }).select(
    "+passwordHash"
  )
  if (!user?.passwordHash) return
  const token = await issueToken(user._id, "verify_email", VERIFY_TTL_MS, ctx.ip)
  await enqueueEmail(
    verifyEmailMessage({ to: email, name: user.name, token }),
    `verify:${hashToken(token)}`
  )
}

// ------------------------------------------------------------------ signing in

export type CredentialResult =
  { ok: true; user: AuthUser } | { ok: false; reason: "invalid" | "unverified" | "suspended" }

/** Checks an email and password. "invalid" covers unknown account, Google-only account and wrong password alike. */
export async function verifyCredentials(
  emailInput: string,
  password: string,
  ctx: AuditContext = {}
): Promise<CredentialResult> {
  await connectDb()
  const email = normalizeEmail(emailInput)
  const user = await User.findOne({ email }).select("+passwordHash")
  if (!user?.passwordHash) {
    await burnPasswordCheck(password)
    return { ok: false, reason: "invalid" }
  }
  if (!(await verifyPassword(user.passwordHash, password))) {
    await User.updateOne({ _id: user._id }, { $inc: { failedLoginCount: 1 } })
    return { ok: false, reason: "invalid" }
  }
  // The password is right, so it is safe to say what is wrong with the account.
  if (user.status !== "active") return { ok: false, reason: "suspended" }
  if (!user.emailVerified) return { ok: false, reason: "unverified" }

  await User.updateOne(
    { _id: user._id },
    { $set: { failedLoginCount: 0, lastLoginAt: new Date() } }
  )
  await recordAudit({
    action: "auth.signed_in",
    actor: { id: user._id.toString(), role: user.role },
    entityType: "user",
    entityId: user._id.toString(),
    details: { method: "password" },
    context: ctx,
  })
  return { ok: true, user: toAuthUser(user) }
}

/** Records the Google identity. False means a simultaneous request already did, so the caller should look again. */
async function linkGoogleIdentity(
  userId: mongoose.Types.ObjectId,
  sub: string,
  email: string
): Promise<boolean> {
  try {
    await AuthAccount.create({
      userId,
      provider: "google",
      providerAccountId: sub,
      emailAtLink: email,
    })
    return true
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return false
    throw error
  }
}

/** Simultaneous first sign-ins race to create the same records; the loser re-reads what the winner wrote. */
function retryGoogleSignIn(
  profile: GoogleProfile,
  ctx: AuditContext,
  attempt: number
): Promise<GoogleResult> {
  if (attempt >= 3) return Promise.resolve({ allowed: false, reason: "invalid" })
  return handleGoogleSignIn(profile, ctx, attempt + 1)
}

export type GoogleProfile = {
  sub: string
  email?: string | null
  email_verified?: boolean | null
  name?: string | null
}
export type GoogleResult =
  | { allowed: true; user: AuthUser }
  | { allowed: false; reason: "unverified_email" | "suspended" | "invalid" }

/**
 * Sign in or sign up with Google. Linking rules (docs/architecture.md §6):
 *  1. Google must say the address is verified.
 *  2. A returning Google identity signs in to its own account.
 *  3. A new Google identity links to an existing account with the same address only if that account's
 *     address is verified too (both prove control of the mailbox). The owner is notified.
 *  4. If the existing account's address was never verified, it is not trusted: its password is removed
 *     and the Google identity takes it over, so a squatter's pre-registered password stops working.
 */
export async function handleGoogleSignIn(
  profile: GoogleProfile,
  ctx: AuditContext = {},
  attempt = 0
): Promise<GoogleResult> {
  await connectDb()
  if (!profile.sub || !profile.email || profile.email_verified !== true)
    return { allowed: false, reason: "unverified_email" }
  const email = normalizeEmail(profile.email)
  const name = (profile.name?.trim() || email.split("@")[0] || "Customer").slice(0, 80)

  const linked = await AuthAccount.findOne({ provider: "google", providerAccountId: profile.sub })
  if (linked) {
    const user = await User.findById(linked.userId)
    if (!user) return { allowed: false, reason: "invalid" }
    if (user.status !== "active") return { allowed: false, reason: "suspended" }
    await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } })
    await recordAudit({
      action: "auth.signed_in",
      actor: { id: user._id.toString(), role: user.role },
      entityType: "user",
      entityId: user._id.toString(),
      details: { method: "google" },
      context: ctx,
    })
    return { allowed: true, user: toAuthUser(user) }
  }

  let user = await User.findOne({ email }).select("+passwordHash")
  if (user && user.status !== "active") return { allowed: false, reason: "suspended" }

  if (user && user.emailVerified) {
    if (!(await linkGoogleIdentity(user._id, profile.sub, email)))
      return retryGoogleSignIn(profile, ctx, attempt)
    await enqueueEmail(
      googleLinkedMessage({ to: email, name: user.name }),
      `google-linked:${user._id}:${profile.sub}`
    )
    await recordAudit({
      action: "auth.google_linked",
      actor: { id: user._id.toString(), role: user.role },
      entityType: "user",
      entityId: user._id.toString(),
      context: ctx,
    })
  } else if (user) {
    user.passwordHash = undefined
    user.emailVerified = new Date()
    user.sessionVersion += 1
    await user.save()
    await AuthToken.deleteMany({ userId: user._id, usedAt: null })
    if (!(await linkGoogleIdentity(user._id, profile.sub, email)))
      return retryGoogleSignIn(profile, ctx, attempt)
    await recordAudit({
      action: "auth.google_adopted_unverified_account",
      entityType: "user",
      entityId: user._id.toString(),
      context: ctx,
    })
  } else {
    try {
      user = await User.create({ email, name, emailVerified: new Date(), role: "customer" })
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error
      return retryGoogleSignIn(profile, ctx, attempt) // another request created it first: take the linking path
    }
    if (!(await linkGoogleIdentity(user._id, profile.sub, email)))
      return retryGoogleSignIn(profile, ctx, attempt)
    await recordAudit({
      action: "auth.registered",
      entityType: "user",
      entityId: user._id.toString(),
      details: { method: "google" },
      context: ctx,
    })
  }
  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } })
  return { allowed: true, user: toAuthUser(user) }
}

/**
 * The signed-in user for a session, or null. Sessions carry only an id and a `sessionVersion`; role,
 * status and the rest are read fresh here, so a suspension or role change takes effect immediately.
 */
export async function getAuthUser(
  userId: string,
  sessionVersion: number
): Promise<AuthUser | null> {
  if (!mongoose.isValidObjectId(userId)) return null
  await connectDb()
  const user = await User.findById(userId).select("+passwordHash")
  if (!user || user.status !== "active" || user.sessionVersion !== sessionVersion) return null
  return toAuthUser(user)
}

// ------------------------------------------------------------------ passwords

/** Starts a reset (also how a Google-only account sets its first password). The response is always the same. */
export async function requestPasswordReset(
  emailInput: string,
  ctx: AuditContext = {}
): Promise<void> {
  await connectDb()
  const email = normalizeEmail(emailInput)
  const user = await User.findOne({ email, status: "active" })
  if (!user) return
  const token = await issueToken(user._id, "reset_password", RESET_TTL_MS, ctx.ip)
  await enqueueEmail(
    passwordResetMessage({ to: email, name: user.name, token }),
    `reset:${hashToken(token)}`
  )
  await recordAudit({
    action: "auth.password_reset_requested",
    entityType: "user",
    entityId: user._id.toString(),
    context: ctx,
  })
}

/** Whether a reset link can still be used, without consuming it (the page checks before showing the form). */
export async function isResetTokenValid(token: string): Promise<boolean> {
  await connectDb()
  return Boolean(await findLiveToken(token, "reset_password"))
}

export async function resetPassword(
  token: string,
  newPassword: string,
  ctx: AuditContext = {}
): Promise<void> {
  await connectDb()
  const found = await findLiveToken(token, "reset_password")
  if (!found) throw new ValidationError(INVALID_LINK)
  const user = await User.findOne({ _id: found.userId, status: "active" })
  if (!user) throw new ValidationError(INVALID_LINK)
  // Check the password before consuming the link, so a rejected password does not waste it.
  assertPasswordAllowed(newPassword, { email: user.email, name: user.name })
  if (!(await claimToken(found._id))) throw new ValidationError(INVALID_LINK)

  const passwordHash = await hashPassword(newPassword)
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        passwordHash,
        failedLoginCount: 0,
        lockedUntil: null,
        ...(user.emailVerified ? {} : { emailVerified: new Date() }),
      },
      $inc: { sessionVersion: 1 }, // every device is signed out
    }
  )
  await AuthToken.deleteMany({ userId: user._id, usedAt: null })
  await enqueueEmail(
    passwordChangedMessage({ to: user.email, name: user.name }),
    `pwchanged:${user._id}:${Date.now()}`
  )
  await recordAudit({
    action: "auth.password_reset",
    actor: { id: user._id.toString(), role: user.role },
    entityType: "user",
    entityId: user._id.toString(),
    context: ctx,
  })
}

export async function changePassword(
  actor: Actor,
  input: { currentPassword: string; newPassword: string },
  ctx: AuditContext = {}
): Promise<void> {
  await connectDb()
  const user = await User.findById(actor.id).select("+passwordHash")
  if (!user || user.status !== "active") throw new NotFoundError()
  if (!user.passwordHash) {
    // A Google-only account has no current password to check; it sets one through the emailed link.
    throw new ForbiddenError("Use the emailed link to set a password for this account.")
  }
  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw new ValidationError("Your current password is not correct.", [
      { path: "currentPassword", issue: "Your current password is not correct." },
    ])
  }
  assertPasswordAllowed(input.newPassword, { email: user.email, name: user.name }, "newPassword")
  if (input.newPassword === input.currentPassword) {
    throw new ValidationError("Choose a password you have not used just now.", [
      { path: "newPassword", issue: "Choose a password you have not used just now." },
    ])
  }
  user.passwordHash = await hashPassword(input.newPassword)
  user.sessionVersion += 1
  await user.save()
  await enqueueEmail(
    passwordChangedMessage({ to: user.email, name: user.name }),
    `pwchanged:${user._id}:${Date.now()}`
  )
  await recordAudit({
    action: "auth.password_changed",
    actor,
    entityType: "user",
    entityId: actor.id,
    context: ctx,
  })
}

/** "Sign out everywhere": every existing session, including this one, stops working. */
export async function revokeAllSessions(actor: Actor, ctx: AuditContext = {}): Promise<void> {
  await connectDb()
  await User.updateOne({ _id: actor.id }, { $inc: { sessionVersion: 1 } })
  await recordAudit({
    action: "auth.sessions_revoked",
    actor,
    entityType: "user",
    entityId: actor.id,
    context: ctx,
  })
}

// ------------------------------------------------------------------ staff and role management

const SUPER_ADMIN_LOCK = "lock:super-admin"

/**
 * Runs `change` while holding a database-wide lock on super-admin changes. Two administrators demoting each
 * other at the same moment would otherwise each see the other still in place and both succeed, leaving
 * nobody in charge. Writing the same lock document makes concurrent attempts conflict, so they run one at a time.
 */
async function withSuperAdminLock<T>(
  change: (session: mongoose.ClientSession) => Promise<T>
): Promise<T> {
  const connection = (await connectDb()).connection
  return connection.transaction(async (session) => {
    await RateLimitBucket.findOneAndUpdate(
      { _id: SUPER_ADMIN_LOCK },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date("2999-01-01") } },
      { upsert: true, session }
    )
    return change(session)
  })
}

async function assertNotLastSuperAdmin(targetId: string, session: mongoose.ClientSession) {
  const others = await User.countDocuments({
    role: "super_admin",
    status: "active",
    _id: trusted({ $ne: targetId }),
  }).session(session)
  if (others === 0)
    throw new ForbiddenError("This is the last active super administrator and cannot be changed.")
}

export async function changeUserRole(
  actor: Actor,
  targetId: string,
  role: Role,
  ctx: AuditContext = {}
): Promise<void> {
  assertPermission(actor, "users:manage_roles")
  assertCanGrant(actor, role)
  if (!mongoose.isValidObjectId(targetId)) throw new NotFoundError()
  const before = await withSuperAdminLock(async (session) => {
    const target = await User.findById(targetId).session(session)
    if (!target || target.status === "deleted") throw new NotFoundError()
    assertCanGrant(actor, target.role) // cannot change someone who outranks you
    if (target.role === "super_admin" && role !== "super_admin")
      await assertNotLastSuperAdmin(targetId, session)
    const previous = target.role
    target.role = role
    target.sessionVersion += 1 // their sessions are re-issued with the new role
    await target.save({ session })
    return previous
  })
  await recordAudit({
    action: "user.role_changed",
    actor,
    entityType: "user",
    entityId: targetId,
    details: { from: before, to: role },
    context: ctx,
  })
}

export async function setUserStatus(
  actor: Actor,
  targetId: string,
  status: "active" | "suspended",
  ctx: AuditContext = {}
): Promise<void> {
  assertPermission(actor, "customers:suspend")
  if (!mongoose.isValidObjectId(targetId)) throw new NotFoundError()
  if (targetId === actor.id && status === "suspended")
    throw new ForbiddenError("You cannot suspend your own account.")
  await withSuperAdminLock(async (session) => {
    const target = await User.findById(targetId).session(session)
    if (!target || target.status === "deleted") throw new NotFoundError()
    assertCanGrant(actor, target.role)
    if (target.role === "super_admin" && status === "suspended")
      await assertNotLastSuperAdmin(targetId, session)
    target.status = status
    target.sessionVersion += 1 // a suspended person is signed out everywhere at once
    await target.save({ session })
  })
  await recordAudit({
    action: status === "suspended" ? "user.suspended" : "user.restored",
    actor,
    entityType: "user",
    entityId: targetId,
    context: ctx,
  })
}

/** Creates (or promotes) a verified super administrator. Used by `pnpm admin:create`, never by a web request. */
export async function provisionSuperAdmin(input: {
  email: string
  name: string
  /** For a new account, required. For an existing one it is only used when given: otherwise the password is left alone. */
  password?: string
}): Promise<{ id: string; created: boolean }> {
  await connectDb()
  const email = normalizeEmail(input.email)
  const existing = await User.findOne({ email })
  if (!existing && !input.password) throw new ValidationError("A new account needs a password.")
  if (input.password) assertPasswordAllowed(input.password, { email, name: input.name })
  const passwordHash = input.password ? await hashPassword(input.password) : undefined
  if (existing) {
    existing.role = "super_admin"
    existing.status = "active"
    if (passwordHash) existing.passwordHash = passwordHash
    existing.emailVerified ??= new Date()
    existing.sessionVersion += 1
    await existing.save()
    await recordAudit({
      action: "user.super_admin_provisioned",
      entityType: "user",
      entityId: existing._id.toString(),
      details: { created: false },
    })
    return { id: existing._id.toString(), created: false }
  }
  const user = await User.create({
    email,
    name: input.name.trim(),
    passwordHash,
    emailVerified: new Date(),
    role: "super_admin",
  })
  await recordAudit({
    action: "user.super_admin_provisioned",
    entityType: "user",
    entityId: user._id.toString(),
    details: { created: true },
  })
  return { id: user._id.toString(), created: true }
}
