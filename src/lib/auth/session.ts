import "server-only"
import { cache } from "react"
import { notFound, redirect } from "next/navigation"
import { connection } from "next/server"
import { isStaff, type Permission } from "@/config/permissions"
import { auth } from "@/lib/auth"
import { assertPermission, type Actor } from "@/lib/security/authorize"
import { getAuthUser, type AuthUser } from "@/services/auth-service"

/**
 * The signed-in user for this request, or null. The session cookie only proves who someone *was* at
 * sign-in; this re-reads the account, so a suspension, role change or "sign out everywhere" applies at
 * once. Cached per request so layouts and pages share one lookup.
 */
export const getSessionUser = cache(async (): Promise<AuthUser | null> => {
  // Reading the session is always per request. Auth.js generates random values while doing it, which Next
  // refuses to do during prerendering, so stop prerendering here.
  await connection()
  const session = await auth()
  const id = session?.user?.id
  if (!id) return null
  return getAuthUser(id, session.user.sv)
})

export const toActor = (user: AuthUser): Actor => ({
  id: user.id,
  role: user.role,
  email: user.email,
})

/** For pages that need a signed-in customer. Sends visitors to sign in, then back here. */
export async function requireUser(returnTo: string): Promise<AuthUser> {
  const user = await getSessionUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(returnTo)}`)
  return user
}

/** For server actions: the signed-in actor, or a redirect to sign in. */
export async function requireActor(returnTo = "/account"): Promise<Actor> {
  return toActor(await requireUser(returnTo))
}

/**
 * For admin pages. Anyone who is not staff, or lacks the permission, gets the same 404 as a page that does
 * not exist, so the admin area is not advertised. The real control is `assertPermission` in each service.
 */
export async function requireStaffPage(permission?: Permission): Promise<AuthUser> {
  const user = await getSessionUser()
  if (!user) redirect(`/login?next=${encodeURIComponent("/admin")}`)
  if (!isStaff(user.role)) notFound()
  if (permission) {
    try {
      assertPermission(toActor(user), permission)
    } catch {
      notFound()
    }
  }
  return user
}
