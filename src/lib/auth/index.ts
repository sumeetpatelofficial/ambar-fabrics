import "server-only"
import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"
import { loginSchema } from "@/features/auth/schemas"
import {
  InvalidCredentialsError,
  RateLimitedError,
  SuspendedAccountError,
  UnverifiedEmailError,
} from "@/lib/auth/errors"
import { getServerEnv, isGroupConfigured, requireGroup } from "@/lib/env/server"
import { TooManyRequestsError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { clientIp, enforceRateLimit, RULES } from "@/lib/security/rate-limit"
import { handleGoogleSignIn, verifyCredentials } from "@/services/auth-service"

/** One week, refreshed daily while the person is active. The server can end any session sooner. */
export const SESSION_MAX_AGE = 7 * 24 * 3600

const providers = [
  Credentials({
    credentials: { email: {}, password: {} },
    async authorize(raw, request) {
      const parsed = loginSchema.safeParse(raw)
      if (!parsed.success) throw new InvalidCredentialsError()
      const { email, password } = parsed.data
      const ip = clientIp(request.headers)
      try {
        // Enforced here, not only in the form's action: this callback is also reachable by posting
        // straight to /api/auth/callback/credentials. Limited per address and per email.
        await enforceRateLimit(RULES.login, `ip:${ip}`, `email:${email}`)
      } catch (error) {
        if (error instanceof TooManyRequestsError) throw new RateLimitedError()
        throw error
      }
      const result = await verifyCredentials(email, password, {
        ip,
        userAgent: request.headers.get("user-agent") ?? undefined,
      })
      if (!result.ok) {
        if (result.reason === "unverified") throw new UnverifiedEmailError()
        if (result.reason === "suspended") throw new SuspendedAccountError()
        throw new InvalidCredentialsError()
      }
      const { user } = result
      return { id: user.id, email: user.email, name: user.name, sv: user.sessionVersion }
    },
  }),
  // Google appears only when its credentials are configured.
  ...(isGroupConfigured("googleOAuth")
    ? (() => {
        const { AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET } = requireGroup("googleOAuth")
        // No automatic linking by email: linking is decided by handleGoogleSignIn, with its verified-address rules.
        return [Google({ clientId: AUTH_GOOGLE_ID, clientSecret: AUTH_GOOGLE_SECRET })]
      })()
    : []),
]

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE, updateAge: 24 * 3600 },
  pages: { signIn: "/login", error: "/login" },
  // Behind Vercel the host header is set by the platform. Self-hosting needs AUTH_URL set (docs/deployment.md).
  trustHost: true,
  secret: getServerEnv().AUTH_SECRET,
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") return true
      const result = await handleGoogleSignIn({
        sub: account.providerAccountId,
        email: profile?.email,
        email_verified: profile?.email_verified as boolean | null | undefined,
        name: profile?.name,
      })
      if (!result.allowed) {
        logger.info(
          { event: "auth.google_denied", reason: result.reason },
          "Google sign-in refused"
        )
        return `/login?error=google_${result.reason === "unverified_email" ? "unverified" : "denied"}`
      }
      user.id = result.user.id
      user.sv = result.user.sessionVersion
      user.name = result.user.name
      return true
    },
    jwt({ token, user }) {
      // `user` is present only at sign-in. The token then carries just an id and a session version: role,
      // status and everything else are read from the database on every request.
      if (user?.id) {
        token.uid = user.id
        token.sv = user.sv ?? 0
      }
      delete token.name
      delete token.email
      delete token.picture
      return token
    },
    session({ session, token }) {
      return {
        expires: session.expires,
        user: { id: token.uid ?? "", sv: token.sv ?? -1 },
      } as typeof session
    },
  },
})
