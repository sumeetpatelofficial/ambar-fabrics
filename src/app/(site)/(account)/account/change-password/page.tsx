import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { AccountSkeleton } from "@/components/account/account-skeleton"
import { ChangePasswordForm } from "@/components/account/change-password-form"
import { requireUser, toActor } from "@/lib/auth/session"
import { getProfile } from "@/services/account-service"

export const metadata: Metadata = { title: "Change your password" }

async function Content() {
  const user = await requireUser("/account/change-password")
  const profile = await getProfile(toActor(user))
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-4xl">Change your password</h1>
      {profile.hasPassword ? (
        <ChangePasswordForm />
      ) : (
        <p className="max-w-prose text-pretty text-muted-foreground">
          This account has no password yet.{" "}
          <Link href="/account/security" className="underline underline-offset-4">
            Set one from the security page
          </Link>
          .
        </p>
      )}
    </div>
  )
}

export default function ChangePasswordPage() {
  return (
    <Suspense fallback={<AccountSkeleton />}>
      <Content />
    </Suspense>
  )
}
