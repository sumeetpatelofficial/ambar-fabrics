"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { FormMessage } from "@/components/forms/form-message"
import { ConfirmDialog } from "@/components/storefront/confirm-dialog"
import { requestSetPasswordAction, revokeSessionsAction } from "@/features/account/actions"
import { initialFormState, type FormState } from "@/features/form-state"
import { useWishlist } from "@/stores/wishlist-store"

/** For an account that signs in with Google only: email a link to set a first password. */
export function SetPasswordButton() {
  const [state, setState] = useState<FormState>(initialFormState)
  const [pending, start] = useTransition()
  return (
    <div className="flex flex-col gap-3">
      <FormMessage state={state} />
      <Button
        type="button"
        variant="outline"
        className="self-start"
        disabled={pending}
        onClick={() => start(async () => setState(await requestSetPasswordAction()))}
      >
        {pending ? "Sending" : "Email me a link to set a password"}
      </Button>
    </div>
  )
}

export function SignOutEverywhere() {
  return (
    <ConfirmDialog
      trigger={<Button variant="outline">Sign out everywhere</Button>}
      title="Sign out on every device?"
      description="You will be signed out here too, and will need to sign in again."
      confirmLabel="Sign out everywhere"
      cancelLabel="Stay signed in"
      onConfirm={async () => {
        useWishlist.getState().clear()
        await revokeSessionsAction()
      }}
    />
  )
}
