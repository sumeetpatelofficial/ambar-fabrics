"use client"

import Link from "next/link"
import { useActionState } from "react"
import { FormMessage } from "@/components/forms/form-message"
import { SubmitButton } from "@/components/forms/submit-button"
import { buttonVariants } from "@/components/ui/button"
import { verifyEmailAction } from "@/features/auth/actions"
import { initialFormState } from "@/features/form-state"

/** Confirming needs a button press, so an email scanner that merely opens the link cannot use it up. */
export function VerifyForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(verifyEmailAction, initialFormState)
  if (state.status === "success") {
    return (
      <div className="flex flex-col gap-4">
        <FormMessage state={state} />
        <Link href="/login" className={buttonVariants({ size: "lg" })}>
          Sign in
        </Link>
      </div>
    )
  }
  return (
    <form action={action} className="flex flex-col gap-5">
      <FormMessage state={state} />
      <input type="hidden" name="token" value={token} />
      <SubmitButton pending={pending} pendingLabel="Confirming">
        Confirm my email
      </SubmitButton>
    </form>
  )
}
