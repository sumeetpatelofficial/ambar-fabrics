"use client"

import Link from "next/link"
import { useSession } from "next-auth/react"
import { User } from "lucide-react"
import { cn } from "cn"
import { buttonVariants } from "@/components/ui/button"

/** Header account icon: goes to the account when signed in, to sign in otherwise. */
export function AccountLink({ className }: { className?: string }) {
  const { status } = useSession()
  const signedIn = status === "authenticated"
  return (
    <Link
      href={signedIn ? "/account" : "/login"}
      aria-label={signedIn ? "Your account" : "Sign in"}
      className={cn(buttonVariants({ variant: "ghost", size: "icon" }), className)}
    >
      <User aria-hidden="true" className="size-5" />
    </Link>
  )
}
