import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { AuthCard } from "@/components/auth/auth-card"
import { GoogleButton, OrDivider } from "@/components/auth/google-button"
import { AuthFormSkeleton } from "@/components/auth/auth-skeleton"
import { RegisterForm } from "@/components/auth/register-form"
import { safeNextPath } from "@/features/auth/schemas"
import { getSessionUser } from "@/lib/auth/session"
import { isGroupConfigured } from "@/lib/env/server"

export const metadata: Metadata = { title: "Create an account" }

const REGISTER_DESCRIPTION =
  "Save your addresses, track orders and keep a wishlist. We will email you a link to confirm your address."

async function RegisterContent({ searchParams }: Pick<PageProps<"/register">, "searchParams">) {
  const params = await searchParams
  const next = safeNextPath(Array.isArray(params.next) ? params.next[0] : params.next)
  if (await getSessionUser()) redirect(next)
  return (
    <AuthCard
      title="Create an account"
      description={REGISTER_DESCRIPTION}
      footer={
        <p>
          Already have an account?{" "}
          <Link href="/login" className="text-foreground underline underline-offset-4">
            Sign in
          </Link>
        </p>
      }
    >
      <RegisterForm />
      {isGroupConfigured("googleOAuth") ? (
        <>
          <OrDivider />
          <GoogleButton next={next} label="Sign up with Google" />
        </>
      ) : null}
    </AuthCard>
  )
}

export default function RegisterPage({ searchParams }: PageProps<"/register">) {
  return (
    <Suspense
      fallback={
        <AuthCard
          title="Create an account"
          description={REGISTER_DESCRIPTION}
          footer={<p>Already have an account? Sign in</p>}
        >
          <AuthFormSkeleton fields={3} />
        </AuthCard>
      }
    >
      <RegisterContent searchParams={searchParams} />
    </Suspense>
  )
}
