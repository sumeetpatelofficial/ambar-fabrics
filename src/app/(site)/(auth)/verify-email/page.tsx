import type { Metadata } from "next"
import { Suspense } from "react"
import { AuthCard } from "@/components/auth/auth-card"
import { AuthFormSkeleton } from "@/components/auth/auth-skeleton"
import { ResendForm } from "@/components/auth/resend-form"
import { VerifyForm } from "@/components/auth/verify-form"

// The link carries a one-time token; keep it out of the Referer header sent to anything the page loads.
export const metadata: Metadata = { title: "Confirm your email", referrer: "no-referrer" }

async function VerifyContent({ searchParams }: Pick<PageProps<"/verify-email">, "searchParams">) {
  const params = await searchParams
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const token = one(params.token)
  if (token) {
    return (
      <AuthCard
        title="Confirm your email"
        description="Press the button to finish setting up your account."
      >
        <VerifyForm token={token} />
      </AuthCard>
    )
  }
  return (
    <AuthCard
      title="Check your email"
      description="We sent a confirmation link to your address. It works for 24 hours. Did it not arrive? We can send another."
    >
      <ResendForm email={one(params.email)} />
    </AuthCard>
  )
}

export default function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  return (
    <Suspense
      fallback={
        <AuthCard
          title="Confirm your email"
          description="Press the button to finish setting up your account."
        >
          <AuthFormSkeleton fields={0} />
        </AuthCard>
      }
    >
      <VerifyContent searchParams={searchParams} />
    </Suspense>
  )
}
