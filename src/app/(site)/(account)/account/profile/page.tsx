import type { Metadata } from "next"
import { Suspense } from "react"
import { AccountSkeleton } from "@/components/account/account-skeleton"
import { ProfileForm } from "@/components/account/profile-form"
import { requireUser, toActor } from "@/lib/auth/session"
import { getProfile } from "@/services/account-service"

export const metadata: Metadata = { title: "Your details" }

async function Content() {
  const user = await requireUser("/account/profile")
  const profile = await getProfile(toActor(user))
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-4xl">Your details</h1>
      <ProfileForm profile={profile} />
    </div>
  )
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<AccountSkeleton />}>
      <Content />
    </Suspense>
  )
}
