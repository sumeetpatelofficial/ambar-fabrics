import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { AuthCard } from "@/components/auth/auth-card"
import { AuthFormSkeleton } from "@/components/auth/auth-skeleton"
import { ResetForm } from "@/components/auth/reset-form"
import { buttonVariants } from "@/components/ui/button"
import { isResetTokenValid } from "@/services/auth-service"

export const metadata: Metadata = { title: "Choose a new password", referrer: "no-referrer" }

async function ResetContent({ searchParams }: Pick<PageProps<"/reset-password">, "searchParams">) {
  const params = await searchParams
  const token = Array.isArray(params.token) ? params.token[0] : params.token
  // Checked before showing the form, so an old link says so straight away instead of after typing a password.
  if (!token || !(await isResetTokenValid(token))) {
    return (
      <AuthCard
        title="This link has expired"
        description="Reset links work once, for one hour. Request a new one and we will email it straight away."
      >
        <Link href="/forgot-password" className={buttonVariants({ size: "lg" })}>
          Request a new link
        </Link>
      </AuthCard>
    )
  }
  return (
    <AuthCard
      title="Choose a new password"
      description="You will be signed out on all your devices once it is saved."
    >
      <ResetForm token={token} />
    </AuthCard>
  )
}

export default function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  return (
    <Suspense
      fallback={
        <AuthCard
          title="Choose a new password"
          description="You will be signed out on all your devices once it is saved."
        >
          <AuthFormSkeleton fields={1} />
        </AuthCard>
      }
    >
      <ResetContent searchParams={searchParams} />
    </Suspense>
  )
}
