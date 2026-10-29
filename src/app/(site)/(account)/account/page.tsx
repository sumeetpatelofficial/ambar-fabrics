import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { AccountSkeleton } from "@/components/account/account-skeleton"
import { buttonVariants } from "@/components/ui/button"
import { requireUser, toActor } from "@/lib/auth/session"
import { getProfile, listAddresses } from "@/services/account-service"

export const metadata: Metadata = { title: "Your account" }

async function Overview() {
  const user = await requireUser("/account")
  const actor = toActor(user)
  const [profile, addresses] = await Promise.all([getProfile(actor), listAddresses(actor)])
  const home = addresses[0]
  const card = "flex flex-col gap-3 border p-5 rounded-md"
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl">Hello, {profile.name.split(/\s+/)[0]}</h1>
        <p className="text-muted-foreground">{profile.email}</p>
      </header>
      <ul className="grid gap-4 sm:grid-cols-2">
        <li className={card}>
          <h2 className="text-2xl">Orders</h2>
          <p className="text-pretty text-muted-foreground">
            You have not placed an order yet. When you do, it will appear here with its tracking.
          </p>
          <Link
            href="/shop"
            className={buttonVariants({ variant: "outline", className: "self-start" })}
          >
            Start shopping
          </Link>
        </li>
        <li className={card}>
          <h2 className="text-2xl">Delivery addresses</h2>
          {home ? (
            <p className="text-pretty text-muted-foreground">
              {home.fullName}, {home.line1}, {home.city} {home.pincode}
              {addresses.length > 1 ? ` and ${addresses.length - 1} more` : ""}
            </p>
          ) : (
            <p className="text-pretty text-muted-foreground">
              Save an address to speed up checkout.
            </p>
          )}
          <Link
            href="/account/addresses"
            className={buttonVariants({ variant: "outline", className: "self-start" })}
          >
            {home ? "Manage addresses" : "Add an address"}
          </Link>
        </li>
        <li className={card}>
          <h2 className="text-2xl">Wishlist</h2>
          <p className="text-pretty text-muted-foreground">
            Products you have saved to come back to.
          </p>
          <Link
            href="/account/wishlist"
            className={buttonVariants({ variant: "outline", className: "self-start" })}
          >
            View wishlist
          </Link>
        </li>
        <li className={card}>
          <h2 className="text-2xl">Sign-in and security</h2>
          <p className="text-pretty text-muted-foreground">
            {profile.hasPassword ? "Password" : "No password set"}
            {profile.googleLinked
              ? profile.hasPassword
                ? " and Google"
                : "; signing in with Google"
              : ""}
            .
          </p>
          <Link
            href="/account/security"
            className={buttonVariants({ variant: "outline", className: "self-start" })}
          >
            Review
          </Link>
        </li>
      </ul>
    </div>
  )
}

export default function AccountPage() {
  return (
    <Suspense fallback={<AccountSkeleton />}>
      <Overview />
    </Suspense>
  )
}
