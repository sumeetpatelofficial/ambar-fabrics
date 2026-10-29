import type { MongoMemoryReplSet } from "mongodb-memory-server"
import mongoose from "mongoose"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors"
import { hashToken } from "@/lib/security/tokens"
import { verifyPassword } from "@/lib/security/password"
import { AuditLog } from "@/models/audit-log"
import { AuthAccount } from "@/models/auth-account"
import { AuthToken } from "@/models/auth-token"
import { User } from "@/models/user"
import * as auth from "@/services/auth-service"
import { latestToken, queuedEmails, resetDatabase, startDatabase, stopDatabase } from "./helpers"

let replSet: MongoMemoryReplSet
beforeAll(async () => {
  replSet = await startDatabase("auth_test")
  await Promise.all([User.init(), AuthAccount.init(), AuthToken.init()])
}, 240_000)
afterAll(() => stopDatabase(replSet))
beforeEach(resetDatabase)

const PASSWORD = "a-long-passphrase-42"
const EMAIL = "meera@example.com"

async function registerAndVerify(email = EMAIL, password = PASSWORD, name = "Meera Shah") {
  await auth.registerUser({ name, email, password })
  await auth.verifyEmail(await latestToken("verify_email", email))
  return (await User.findOne({ email }))!
}

const actorOf = (u: { _id: mongoose.Types.ObjectId; role: string }) => ({
  id: u._id.toString(),
  role: u.role as "customer",
})

describe("registration", () => {
  it("creates an unverified customer with an Argon2id hash and queues one verification email", async () => {
    await auth.registerUser({
      name: "Meera Shah",
      email: "  Meera@Example.com ",
      password: PASSWORD,
    })
    const user = await User.findOne({ email: EMAIL }).select("+passwordHash")
    expect(user).toMatchObject({
      name: "Meera Shah",
      role: "customer",
      status: "active",
      emailVerified: null,
      sessionVersion: 0,
    })
    expect(user!.passwordHash).toMatch(/^\$argon2id\$/)
    expect(await verifyPassword(user!.passwordHash!, PASSWORD)).toBe(true)
    const emails = await queuedEmails({ template: "verify_email" })
    expect(emails).toHaveLength(1)
    expect(emails[0]!.to).toBe(EMAIL)
  })

  it("stores only a hash of the token, never the token itself", async () => {
    await auth.registerUser({ name: "Meera", email: EMAIL, password: PASSWORD })
    const token = await latestToken("verify_email", EMAIL)
    const rows = await AuthToken.find({}).lean()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.tokenHash).toBe(hashToken(token))
    expect(JSON.stringify(rows)).not.toContain(token)
    expect(rows[0]!.expiresAt.getTime() - Date.now()).toBeGreaterThan(23 * 3600_000)
  })

  it.each([["short"], ["password123"], ["aaaaaaaaaaaa"], ["meera.shah-2026"]])(
    "rejects the weak password %s and creates nothing",
    async (password) => {
      await expect(
        auth.registerUser({ name: "Meera", email: "meera.shah@example.com", password })
      ).rejects.toBeInstanceOf(ValidationError)
      expect(await User.countDocuments()).toBe(0)
      expect(await queuedEmails()).toHaveLength(0)
    }
  )

  it("does not reveal that an address is registered: the existing account is left alone and told by email", async () => {
    const original = await registerAndVerify()
    await expect(
      auth.registerUser({
        name: "Someone Else",
        email: EMAIL,
        password: "another-long-passphrase-9",
      })
    ).resolves.toBeUndefined()
    const after = await User.findOne({ email: EMAIL }).select("+passwordHash")
    expect(after!.name).toBe("Meera Shah")
    expect(after!.passwordHash).toBe(
      (await User.findById(original._id).select("+passwordHash"))!.passwordHash
    )
    expect(await User.countDocuments()).toBe(1)
    expect(await queuedEmails({ template: "account_exists", to: EMAIL })).toHaveLength(1)
  })

  it("sends at most one 'you already have an account' email per hour", async () => {
    await registerAndVerify()
    for (let i = 0; i < 5; i++)
      await auth.registerUser({ name: "x", email: EMAIL, password: "another-long-passphrase-9" })
    expect(await queuedEmails({ template: "account_exists" })).toHaveLength(1)
  })

  it("lets a new registration take over an unverified address, killing the squatter's password and old link", async () => {
    await auth.registerUser({
      name: "Squatter",
      email: EMAIL,
      password: "zk-vs-long-password-1",
    })
    const oldToken = await latestToken("verify_email", EMAIL)
    await auth.registerUser({ name: "Real Owner", email: EMAIL, password: PASSWORD })
    expect(await User.countDocuments()).toBe(1)
    await expect(auth.verifyEmail(oldToken)).rejects.toBeInstanceOf(ValidationError)
    await auth.verifyEmail(await latestToken("verify_email", EMAIL))
    expect(await auth.verifyCredentials(EMAIL, "zk-vs-long-password-1")).toEqual({
      ok: false,
      reason: "invalid",
    })
    expect((await auth.verifyCredentials(EMAIL, PASSWORD)).ok).toBe(true)
  })

  it("gives suspended accounts no email and no change", async () => {
    const user = await registerAndVerify()
    await User.updateOne({ _id: user._id }, { status: "suspended" })
    await auth.registerUser({ name: "x", email: EMAIL, password: PASSWORD })
    expect(await queuedEmails({ template: "account_exists" })).toHaveLength(0)
  })

  it("two simultaneous registrations for one address create one account", async () => {
    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        auth.registerUser({ name: "Meera", email: EMAIL, password: `${PASSWORD}-${i}` })
      )
    )
    expect(await User.countDocuments({ email: EMAIL })).toBe(1)
  })
})

describe("email verification", () => {
  it("verifies once, and the link cannot be reused", async () => {
    await auth.registerUser({ name: "Meera", email: EMAIL, password: PASSWORD })
    const token = await latestToken("verify_email", EMAIL)
    await auth.verifyEmail(token)
    expect((await User.findOne({ email: EMAIL }))!.emailVerified).toBeInstanceOf(Date)
    await expect(auth.verifyEmail(token)).rejects.toBeInstanceOf(ValidationError)
  })

  it("rejects expired, unknown and malformed links with the same message", async () => {
    await auth.registerUser({ name: "Meera", email: EMAIL, password: PASSWORD })
    const token = await latestToken("verify_email", EMAIL)
    await AuthToken.updateMany({}, { expiresAt: new Date(Date.now() - 1000) })
    const messages = new Set<string>()
    for (const t of [token, "x".repeat(43), "", "short", "<script>", "a".repeat(500)]) {
      const error = await auth.verifyEmail(t).catch((e: Error) => e)
      expect(error).toBeInstanceOf(ValidationError)
      messages.add((error as Error).message)
    }
    expect(messages.size).toBe(1)
    expect((await User.findOne({ email: EMAIL }))!.emailVerified).toBeNull()
  })

  it("is single-use even when the same link is submitted twice at once", async () => {
    await auth.registerUser({ name: "Meera", email: EMAIL, password: PASSWORD })
    const token = await latestToken("verify_email", EMAIL)
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => auth.verifyEmail(token))
    )
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
  })

  it("a verification link cannot be used to reset a password", async () => {
    await auth.registerUser({ name: "Meera", email: EMAIL, password: PASSWORD })
    const token = await latestToken("verify_email", EMAIL)
    await expect(auth.resetPassword(token, "brand-new-passphrase-7")).rejects.toBeInstanceOf(
      ValidationError
    )
    expect(await auth.isResetTokenValid(token)).toBe(false)
  })

  it("resend issues a fresh link and retires the old one, only for unverified accounts, and says nothing otherwise", async () => {
    await auth.registerUser({ name: "Meera", email: EMAIL, password: PASSWORD })
    const first = await latestToken("verify_email", EMAIL)
    await auth.resendVerification(EMAIL)
    const second = await latestToken("verify_email", EMAIL)
    expect(second).not.toBe(first)
    await expect(auth.verifyEmail(first)).rejects.toBeInstanceOf(ValidationError)
    await auth.verifyEmail(second)

    const before = (await queuedEmails()).length
    await auth.resendVerification(EMAIL) // already verified
    await auth.resendVerification("nobody@example.com") // unknown
    expect((await queuedEmails()).length).toBe(before)
  })
})

describe("signing in with a password", () => {
  it("returns the user (without any hash) when email and password are right", async () => {
    await registerAndVerify()
    const result = await auth.verifyCredentials("MEERA@example.com", PASSWORD)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.user).toMatchObject({
        email: EMAIL,
        role: "customer",
        emailVerified: true,
        hasPassword: true,
      })
      expect(JSON.stringify(result.user)).not.toMatch(/argon2|passwordHash/)
    }
    expect((await User.findOne({ email: EMAIL }))!.lastLoginAt).toBeInstanceOf(Date)
  })

  it("answers 'invalid' alike for a wrong password, an unknown address and a Google-only account", async () => {
    await registerAndVerify()
    await User.create({ email: "g@example.com", name: "G", emailVerified: new Date() }) // no password
    const wrong = await auth.verifyCredentials(EMAIL, "wrong-password-123")
    const unknown = await auth.verifyCredentials("nobody@example.com", PASSWORD)
    const googleOnly = await auth.verifyCredentials("g@example.com", PASSWORD)
    expect(wrong).toEqual({ ok: false, reason: "invalid" })
    expect(unknown).toEqual(wrong)
    expect(googleOnly).toEqual(wrong)
  })

  it("only reveals 'unverified' or 'suspended' once the password is right", async () => {
    await auth.registerUser({ name: "Meera", email: EMAIL, password: PASSWORD })
    expect(await auth.verifyCredentials(EMAIL, "wrong-password-123")).toEqual({
      ok: false,
      reason: "invalid",
    })
    expect(await auth.verifyCredentials(EMAIL, PASSWORD)).toEqual({
      ok: false,
      reason: "unverified",
    })
    await auth.verifyEmail(await latestToken("verify_email", EMAIL))
    await User.updateOne({ email: EMAIL }, { status: "suspended" })
    expect(await auth.verifyCredentials(EMAIL, "wrong-password-123")).toEqual({
      ok: false,
      reason: "invalid",
    })
    expect(await auth.verifyCredentials(EMAIL, PASSWORD)).toEqual({
      ok: false,
      reason: "suspended",
    })
  })

  it("counts failed attempts and resets the count on success", async () => {
    await registerAndVerify()
    for (let i = 0; i < 3; i++) await auth.verifyCredentials(EMAIL, "wrong-password-123")
    expect((await User.findOne({ email: EMAIL }))!.failedLoginCount).toBe(3)
    await auth.verifyCredentials(EMAIL, PASSWORD)
    expect((await User.findOne({ email: EMAIL }))!.failedLoginCount).toBe(0)
  })

  it("treats NoSQL operators in the email or password as plain text", async () => {
    await registerAndVerify()
    expect(
      await auth
        .verifyCredentials({ $ne: "" } as unknown as string, PASSWORD)
        .catch(() => ({ ok: false }))
    ).toMatchObject({ ok: false })
    expect(
      await auth
        .verifyCredentials(EMAIL, { $ne: "" } as unknown as string)
        .catch(() => ({ ok: false }))
    ).toMatchObject({ ok: false })
  })
})

describe("sessions", () => {
  it("a session is valid only while its version matches, and only for active users", async () => {
    const user = await registerAndVerify()
    const id = user._id.toString()
    expect(await auth.getAuthUser(id, 0)).toMatchObject({ email: EMAIL, role: "customer" })
    expect(await auth.getAuthUser(id, 1)).toBeNull()
    expect(await auth.getAuthUser("not-an-id", 0)).toBeNull()
    expect(await auth.getAuthUser(new mongoose.Types.ObjectId().toString(), 0)).toBeNull()
    await User.updateOne({ _id: user._id }, { status: "suspended" })
    expect(await auth.getAuthUser(id, 0)).toBeNull()
  })

  it("reads the role from the database every time, so a demotion applies immediately", async () => {
    const user = await registerAndVerify()
    await User.updateOne({ _id: user._id }, { role: "admin" })
    expect((await auth.getAuthUser(user._id.toString(), 0))!.role).toBe("admin")
    await User.updateOne({ _id: user._id }, { role: "customer" })
    expect((await auth.getAuthUser(user._id.toString(), 0))!.role).toBe("customer")
  })

  it("'sign out everywhere' invalidates every existing session and is audited", async () => {
    const user = await registerAndVerify()
    await auth.revokeAllSessions(actorOf(user))
    expect(await auth.getAuthUser(user._id.toString(), 0)).toBeNull()
    expect((await User.findById(user._id))!.sessionVersion).toBe(1)
    expect(
      await AuditLog.countDocuments({
        action: "auth.sessions_revoked",
        entityId: user._id.toString(),
      })
    ).toBe(1)
  })
})

describe("forgot and reset password", () => {
  it("queues a reset email for a known address and nothing at all for an unknown one", async () => {
    await registerAndVerify()
    await auth.requestPasswordReset("nobody@example.com")
    expect(await queuedEmails({ template: "password_reset" })).toHaveLength(0)
    expect(await AuthToken.countDocuments({ purpose: "reset_password" })).toBe(0)
    await auth.requestPasswordReset(" MEERA@example.com ")
    expect(await queuedEmails({ template: "password_reset", to: EMAIL })).toHaveLength(1)
    const token = await latestToken("password_reset", EMAIL)
    expect(
      (await AuthToken.findOne({ purpose: "reset_password" }))!.expiresAt.getTime() - Date.now()
    ).toBeLessThan(3601_000)
    expect(await auth.isResetTokenValid(token)).toBe(true)
  })

  it("sets the new password, signs out every device, tells the owner, and the link works once", async () => {
    const user = await registerAndVerify()
    await auth.requestPasswordReset(EMAIL)
    const token = await latestToken("password_reset", EMAIL)
    await auth.resetPassword(token, "brand-new-passphrase-7")
    expect((await auth.verifyCredentials(EMAIL, "brand-new-passphrase-7")).ok).toBe(true)
    expect(await auth.verifyCredentials(EMAIL, PASSWORD)).toEqual({ ok: false, reason: "invalid" })
    expect(await auth.getAuthUser(user._id.toString(), 0)).toBeNull()
    expect(await queuedEmails({ template: "password_changed", to: EMAIL })).toHaveLength(1)
    await expect(auth.resetPassword(token, "yet-another-passphrase-8")).rejects.toBeInstanceOf(
      ValidationError
    )
    expect(await auth.isResetTokenValid(token)).toBe(false)
  })

  it("rejects a weak new password without using up the link", async () => {
    await registerAndVerify()
    await auth.requestPasswordReset(EMAIL)
    const token = await latestToken("password_reset", EMAIL)
    await expect(auth.resetPassword(token, "short")).rejects.toBeInstanceOf(ValidationError)
    await expect(auth.resetPassword(token, "password123")).rejects.toBeInstanceOf(ValidationError)
    expect(await auth.isResetTokenValid(token)).toBe(true)
    await auth.resetPassword(token, "brand-new-passphrase-7")
  })

  it("a newer request retires the older link", async () => {
    await registerAndVerify()
    await auth.requestPasswordReset(EMAIL)
    const first = await latestToken("password_reset", EMAIL)
    await auth.requestPasswordReset(EMAIL)
    const second = await latestToken("password_reset", EMAIL)
    await expect(auth.resetPassword(first, "brand-new-passphrase-7")).rejects.toBeInstanceOf(
      ValidationError
    )
    await auth.resetPassword(second, "brand-new-passphrase-7")
  })

  it("rejects expired links and is single-use under simultaneous submissions", async () => {
    await registerAndVerify()
    await auth.requestPasswordReset(EMAIL)
    const token = await latestToken("password_reset", EMAIL)
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) => auth.resetPassword(token, `brand-new-passphrase-${i}`))
    )
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)

    await auth.requestPasswordReset(EMAIL)
    const expired = await latestToken("password_reset", EMAIL)
    await AuthToken.updateMany({}, { expiresAt: new Date(Date.now() - 1000) })
    await expect(auth.resetPassword(expired, "another-passphrase-123")).rejects.toBeInstanceOf(
      ValidationError
    )
  })

  it("proves mailbox control, so it also verifies an unverified account and lets a Google-only account set a password", async () => {
    await auth.registerUser({ name: "Meera", email: EMAIL, password: PASSWORD })
    await auth.requestPasswordReset(EMAIL)
    await auth.resetPassword(await latestToken("password_reset", EMAIL), "brand-new-passphrase-7")
    expect((await User.findOne({ email: EMAIL }))!.emailVerified).toBeInstanceOf(Date)

    await User.create({ email: "g@example.com", name: "Gita", emailVerified: new Date() })
    await auth.requestPasswordReset("g@example.com")
    await auth.resetPassword(
      await latestToken("password_reset", "g@example.com"),
      "chosen-passphrase-for-g-5"
    )
    expect((await auth.verifyCredentials("g@example.com", "chosen-passphrase-for-g-5")).ok).toBe(
      true
    )
  })

  it("gives suspended accounts no reset email", async () => {
    const user = await registerAndVerify()
    await User.updateOne({ _id: user._id }, { status: "suspended" })
    await auth.requestPasswordReset(EMAIL)
    expect(await queuedEmails({ template: "password_reset" })).toHaveLength(0)
  })
})

describe("changing a password while signed in", () => {
  it("needs the current password, enforces the policy, and signs out other devices", async () => {
    const user = await registerAndVerify()
    const actor = actorOf(user)
    await expect(
      auth.changePassword(actor, {
        currentPassword: "not-my-password-1",
        newPassword: "brand-new-passphrase-7",
      })
    ).rejects.toThrow("current password is not correct")
    await expect(
      auth.changePassword(actor, { currentPassword: PASSWORD, newPassword: "short" })
    ).rejects.toBeInstanceOf(ValidationError)
    await expect(
      auth.changePassword(actor, { currentPassword: PASSWORD, newPassword: PASSWORD })
    ).rejects.toBeInstanceOf(ValidationError)
    await auth.changePassword(actor, {
      currentPassword: PASSWORD,
      newPassword: "brand-new-passphrase-7",
    })
    expect((await User.findById(user._id))!.sessionVersion).toBe(1)
    expect((await auth.verifyCredentials(EMAIL, "brand-new-passphrase-7")).ok).toBe(true)
    expect(await queuedEmails({ template: "password_changed" })).toHaveLength(1)
    expect(await AuditLog.countDocuments({ action: "auth.password_changed" })).toBe(1)
  })

  it("a Google-only account cannot 'change' a password it does not have", async () => {
    const user = await User.create({ email: "g@example.com", name: "G", emailVerified: new Date() })
    await expect(
      auth.changePassword(actorOf(user), {
        currentPassword: "x",
        newPassword: "brand-new-passphrase-7",
      })
    ).rejects.toBeInstanceOf(ForbiddenError)
  })
})

describe("sign in with Google", () => {
  const profile = { sub: "google-sub-1", email: EMAIL, email_verified: true, name: "Meera Shah" }

  it("refuses an address Google has not verified, or a profile with no email", async () => {
    expect(await auth.handleGoogleSignIn({ ...profile, email_verified: false })).toEqual({
      allowed: false,
      reason: "unverified_email",
    })
    expect(await auth.handleGoogleSignIn({ ...profile, email_verified: undefined })).toEqual({
      allowed: false,
      reason: "unverified_email",
    })
    expect(await auth.handleGoogleSignIn({ ...profile, email: null })).toEqual({
      allowed: false,
      reason: "unverified_email",
    })
    expect(await auth.handleGoogleSignIn({ ...profile, sub: "" })).toEqual({
      allowed: false,
      reason: "unverified_email",
    })
    expect(await User.countDocuments()).toBe(0)
  })

  it("creates a verified customer with no password for a new person", async () => {
    const result = await auth.handleGoogleSignIn(profile)
    expect(result.allowed).toBe(true)
    const user = await User.findOne({ email: EMAIL }).select("+passwordHash")
    expect(user).toMatchObject({ role: "customer", name: "Meera Shah" })
    expect(user!.emailVerified).toBeInstanceOf(Date)
    expect(user!.passwordHash).toBeUndefined()
    expect(
      await AuthAccount.countDocuments({ provider: "google", providerAccountId: "google-sub-1" })
    ).toBe(1)
  })

  it("signs a returning Google identity in to the same account, even if their Google address changed", async () => {
    const first = await auth.handleGoogleSignIn(profile)
    const second = await auth.handleGoogleSignIn({ ...profile, email: "new-address@example.com" })
    expect(first.allowed && second.allowed && first.user.id === second.user.id).toBe(true)
    expect(await User.countDocuments()).toBe(1)
  })

  it("links to an existing account whose address is verified, keeps its password, and notifies the owner", async () => {
    const user = await registerAndVerify()
    const result = await auth.handleGoogleSignIn(profile)
    expect(result.allowed && result.user.id).toBe(user._id.toString())
    expect(await User.countDocuments()).toBe(1)
    expect((await auth.verifyCredentials(EMAIL, PASSWORD)).ok).toBe(true)
    expect(await queuedEmails({ template: "google_linked", to: EMAIL })).toHaveLength(1)
    expect(await AuditLog.countDocuments({ action: "auth.google_linked" })).toBe(1)
  })

  it("does NOT trust an unverified account: its password is removed and Google takes it over", async () => {
    await auth.registerUser({
      name: "Squatter",
      email: EMAIL,
      password: "zk-vs-long-password-1",
    })
    const staleToken = await latestToken("verify_email", EMAIL)
    const result = await auth.handleGoogleSignIn(profile)
    expect(result.allowed).toBe(true)
    const user = await User.findOne({ email: EMAIL }).select("+passwordHash")
    expect(user!.passwordHash).toBeUndefined()
    expect(user!.emailVerified).toBeInstanceOf(Date)
    expect(user!.sessionVersion).toBe(1)
    expect(await auth.verifyCredentials(EMAIL, "zk-vs-long-password-1")).toEqual({
      ok: false,
      reason: "invalid",
    })
    await expect(auth.verifyEmail(staleToken)).rejects.toBeInstanceOf(ValidationError)
  })

  it("refuses a suspended account, whether it arrives by a linked identity or by address", async () => {
    await auth.handleGoogleSignIn(profile)
    await User.updateOne({ email: EMAIL }, { status: "suspended" })
    expect(await auth.handleGoogleSignIn(profile)).toEqual({ allowed: false, reason: "suspended" })
    expect(await auth.handleGoogleSignIn({ ...profile, sub: "google-sub-2" })).toEqual({
      allowed: false,
      reason: "suspended",
    })
  })

  it("never grants a role from Google: even an existing admin keeps only what the database says", async () => {
    await registerAndVerify()
    await User.updateOne({ email: EMAIL }, { role: "support" })
    const result = await auth.handleGoogleSignIn({
      ...profile,
      role: "super_admin",
    } as typeof profile)
    expect(result.allowed && result.user.role).toBe("support")
    const created = await auth.handleGoogleSignIn({
      sub: "s2",
      email: "new@example.com",
      email_verified: true,
      name: "New",
      role: "super_admin",
    } as typeof profile)
    expect(created.allowed && created.user.role).toBe("customer")
  })

  it("two simultaneous first sign-ins create exactly one user and one linked identity", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () => auth.handleGoogleSignIn(profile))
    )
    expect(results.every((r) => r.allowed)).toBe(true)
    expect(await User.countDocuments()).toBe(1)
    expect(await AuthAccount.countDocuments()).toBe(1)
  })

  it("a Google-only account can later add a password through a reset link, keeping Google", async () => {
    await auth.handleGoogleSignIn(profile)
    await auth.requestPasswordReset(EMAIL)
    await auth.resetPassword(await latestToken("password_reset", EMAIL), "brand-new-passphrase-7")
    expect((await auth.verifyCredentials(EMAIL, "brand-new-passphrase-7")).ok).toBe(true)
    expect((await auth.handleGoogleSignIn(profile)).allowed).toBe(true)
    expect(await User.countDocuments()).toBe(1)
  })
})

describe("roles and the last super administrator", () => {
  const make = (email: string, role: "customer" | "support" | "admin" | "super_admin") =>
    User.create({ email, name: email.split("@")[0], emailVerified: new Date(), role })

  it("lets only a super administrator change roles, and only up to their own level", async () => {
    const customer = await make("c@example.com", "customer")
    const admin = await make("a@example.com", "admin")
    const sa = await make("s@example.com", "super_admin")
    await expect(
      auth.changeUserRole(actorOf(customer), customer._id.toString(), "admin")
    ).rejects.toBeInstanceOf(ForbiddenError)
    await expect(
      auth.changeUserRole(actorOf(admin), customer._id.toString(), "support")
    ).rejects.toBeInstanceOf(ForbiddenError) // admin lacks users:manage_roles
    await auth.changeUserRole(actorOf(sa), customer._id.toString(), "support")
    expect((await User.findById(customer._id))!.role).toBe("support")
    expect((await User.findById(customer._id))!.sessionVersion).toBe(1) // their session is re-issued
    expect(await AuditLog.findOne({ action: "user.role_changed" }).lean()).toMatchObject({
      details: { from: "customer", to: "support" },
    })
  })

  it("refuses an unknown target and a malformed id with 'not found'", async () => {
    const sa = await make("s@example.com", "super_admin")
    await expect(
      auth.changeUserRole(actorOf(sa), new mongoose.Types.ObjectId().toString(), "admin")
    ).rejects.toBeInstanceOf(NotFoundError)
    await expect(auth.changeUserRole(actorOf(sa), "nope", "admin")).rejects.toBeInstanceOf(
      NotFoundError
    )
  })

  it("will not demote or suspend the last active super administrator", async () => {
    const sa = await make("s@example.com", "super_admin")
    await expect(auth.changeUserRole(actorOf(sa), sa._id.toString(), "admin")).rejects.toThrow(
      "last active super administrator"
    )
    await expect(
      auth.setUserStatus(actorOf(sa), sa._id.toString(), "suspended")
    ).rejects.toBeInstanceOf(ForbiddenError)
    expect((await User.findById(sa._id))!.role).toBe("super_admin")
  })

  it("allows demoting one of two super administrators", async () => {
    const one = await make("one@example.com", "super_admin")
    const two = await make("two@example.com", "super_admin")
    await auth.changeUserRole(actorOf(one), two._id.toString(), "admin")
    expect(await User.countDocuments({ role: "super_admin", status: "active" })).toBe(1)
  })

  it("two super administrators demoting each other at the same instant cannot leave zero", async () => {
    for (let round = 0; round < 6; round++) {
      await resetDatabase()
      const one = await make("one@example.com", "super_admin")
      const two = await make("two@example.com", "super_admin")
      const results = await Promise.allSettled([
        auth.changeUserRole(actorOf(one), two._id.toString(), "admin"),
        auth.changeUserRole(actorOf(two), one._id.toString(), "admin"),
      ])
      expect(
        await User.countDocuments({ role: "super_admin", status: "active" }),
        `round ${round}`
      ).toBeGreaterThanOrEqual(1)
      expect(results.filter((r) => r.status === "fulfilled").length).toBeLessThanOrEqual(1)
    }
  })

  it("suspends and restores users, signing them out at once, but never oneself", async () => {
    const sa = await make("s@example.com", "super_admin")
    const admin = await make("a@example.com", "admin")
    const customer = await make("c@example.com", "customer")
    await expect(
      auth.setUserStatus(actorOf(sa), sa._id.toString(), "suspended")
    ).rejects.toBeInstanceOf(ForbiddenError)
    await expect(
      auth.setUserStatus(actorOf(customer), customer._id.toString(), "suspended")
    ).rejects.toBeInstanceOf(ForbiddenError)
    await auth.setUserStatus(actorOf(admin), customer._id.toString(), "suspended")
    expect(await auth.getAuthUser(customer._id.toString(), 0)).toBeNull()
    await auth.setUserStatus(actorOf(admin), customer._id.toString(), "active")
    expect(await auth.getAuthUser(customer._id.toString(), 2)).not.toBeNull() // suspending and restoring each re-issue sessions
    await expect(
      auth.setUserStatus(actorOf(admin), sa._id.toString(), "suspended")
    ).rejects.toBeInstanceOf(ForbiddenError) // outranks the admin
  })

  it("provisions a verified super administrator from the command line path, and can promote an existing account", async () => {
    const created = await auth.provisionSuperAdmin({
      email: "Owner@Example.com",
      name: "Owner",
      password: "long-passphrase-for-admin-3",
    })
    expect(created.created).toBe(true)
    expect(
      (await auth.verifyCredentials("owner@example.com", "long-passphrase-for-admin-3")).ok
    ).toBe(true)
    await expect(
      auth.provisionSuperAdmin({ email: "x@example.com", name: "X", password: "short" })
    ).rejects.toBeInstanceOf(ValidationError)
    const existing = await registerAndVerify()
    const promoted = await auth.provisionSuperAdmin({
      email: EMAIL,
      name: "Meera",
      password: "long-passphrase-for-admin-3",
    })
    expect(promoted).toEqual({ id: existing._id.toString(), created: false })
    expect((await User.findById(existing._id))!.role).toBe("super_admin")
  })
})

describe("audit trail", () => {
  it("records sign-in, registration and password events without secrets", async () => {
    await registerAndVerify()
    await auth.verifyCredentials(EMAIL, PASSWORD, { ip: "203.0.113.9", userAgent: "test" })
    const logs = await AuditLog.find({}).lean()
    expect(logs.map((l) => l.action).sort()).toEqual([
      "auth.email_verified",
      "auth.registered",
      "auth.signed_in",
    ])
    expect(logs.find((l) => l.action === "auth.signed_in")).toMatchObject({
      ip: "203.0.113.9",
      entityType: "user",
    })
    const text = JSON.stringify(logs)
    expect(text).not.toContain(PASSWORD)
    expect(text).not.toMatch(/argon2|tokenHash/)
  })
})
