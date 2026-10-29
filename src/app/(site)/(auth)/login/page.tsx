import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { AuthCard } from "@/components/auth/auth-card"
import { GoogleButton, OrDivider } from "@/components/auth/google-button"
import { AuthFormSkeleton } from "@/components/auth/auth-skeleton"
import { LoginForm } from "@/components/auth/login-form"
import { Notice } from "@/components/auth/notice"
import { safeNextPath } from "@/features/auth/schemas"
import { getSessionUser } from "@/lib/auth/session"
import { isGroupConfigured } from "@/lib/env/server"

export const metadata: Metadata = { title: "Sign in" }

const OAUTH_ERRORS: Record<string, string> = {
  google_unverified:
    "Google could not confirm your email address, so we could not sign you in with it.",
  google_denied:
    "Google sign-in is not available for this account. Try your email and password instead.",
}

const LOGIN_DESCRIPTION = "Welcome back. Sign in to see your orders, addresses and wishlist."

async function LoginContent({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const params = await searchParams
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const next = safeNextPath(one(params.next))
  if (await getSessionUser()) redirect(next)

  const error = one(params.error)
  return (
    <AuthCard
      title="Sign in"
      description={LOGIN_DESCRIPTION}
      footer={
        <p>
          New here?{" "}
          <Link
            href={`/register${next !== "/account" ? `?next=${encodeURIComponent(next)}` : ""}`}
            className="text-foreground underline underline-offset-4"
          >
            Create an account
          </Link>
        </p>
      }
    >
      {one(params.reset) ? (
        <Notice tone="success">Your password is updated. Sign in with the new one.</Notice>
      ) : null}
      {one(params.signedout) ? (
        <Notice tone="success">You have been signed out on every device.</Notice>
      ) : null}
      {error ? (
        <Notice tone="error">
          {OAUTH_ERRORS[error] ?? "We could not sign you in. Please try again."}
        </Notice>
      ) : null}
      <LoginForm next={next === "/account" ? undefined : next} />
      {isGroupConfigured("googleOAuth") ? (
        <>
          <OrDivider />
          <GoogleButton next={next} />
        </>
      ) : null}
    </AuthCard>
  )
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <Suspense
      fallback={
        <AuthCard
          title="Sign in"
          description={LOGIN_DESCRIPTION}
          footer={<p>New here? Create an account</p>}
        >
          <AuthFormSkeleton fields={2} extra={1} />
        </AuthCard>
      }
    >
      <LoginContent searchParams={searchParams} />
    </Suspense>
  )
}
