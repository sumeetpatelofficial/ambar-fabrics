import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { AccountSkeleton } from "@/components/account/account-skeleton"
import { Notice } from "@/components/auth/notice"
import { SetPasswordButton, SignOutEverywhere } from "@/components/account/security-actions"
import { buttonVariants } from "@/components/ui/button"
import { requireUser, toActor } from "@/lib/auth/session"
import { getProfile } from "@/services/account-service"

export const metadata: Metadata = { title: "Sign-in and security" }

async function Content({ searchParams }: Pick<PageProps<"/account/security">, "searchParams">) {
  const user = await requireUser("/account/security")
  const params = await searchParams
  const profile = await getProfile(toActor(user))
  const section = "flex flex-col gap-3 border-t pt-6"
  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <h1 className="text-4xl">Sign-in and security</h1>
      {params.changed ? (
        <Notice tone="success">
          Your password is changed. You have been signed out on your other devices.
        </Notice>
      ) : null}

      <section aria-labelledby="methods" className={section}>
        <h2 id="methods" className="text-2xl">
          How you sign in
        </h2>
        <ul className="flex flex-col gap-1 text-[0.95rem]">
          <li>
            Email: <span className="font-medium">{profile.email}</span>{" "}
            {profile.emailVerified ? "(confirmed)" : "(not yet confirmed)"}
          </li>
          <li>Password: {profile.hasPassword ? "set" : "not set"}</li>
          <li>Google: {profile.googleLinked ? "linked" : "not linked"}</li>
        </ul>
      </section>

      <section aria-labelledby="password" className={section}>
        <h2 id="password" className="text-2xl">
          Password
        </h2>
        {profile.hasPassword ? (
          <>
            <p className="text-pretty text-muted-foreground">
              Changing it signs you out on your other devices.
            </p>
            <Link
              href="/account/change-password"
              className={buttonVariants({ variant: "outline", className: "self-start" })}
            >
              Change password
            </Link>
          </>
        ) : (
          <>
            <p className="text-pretty text-muted-foreground">
              You sign in with Google, so there is no password yet. Set one if you also want to sign
              in with your email address.
            </p>
            <SetPasswordButton />
          </>
        )}
      </section>

      <section aria-labelledby="devices" className={section}>
        <h2 id="devices" className="text-2xl">
          Devices
        </h2>
        <p className="text-pretty text-muted-foreground">
          If you used a shared or public computer, or lost a phone, you can end every session at
          once.
        </p>
        <div>
          <SignOutEverywhere />
        </div>
      </section>
    </div>
  )
}

export default function SecurityPage({ searchParams }: PageProps<"/account/security">) {
  return (
    <Suspense fallback={<AccountSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  )
}
