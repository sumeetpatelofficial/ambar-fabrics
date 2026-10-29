"use client"

import { useActionState } from "react"
import { FormMessage } from "@/components/forms/form-message"
import { SubmitButton } from "@/components/forms/submit-button"
import { TextField } from "@/components/forms/text-field"
import { resetPasswordAction } from "@/features/auth/actions"
import { initialFormState } from "@/features/form-state"
import { PASSWORD_MIN } from "@/lib/security/password-policy"

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, initialFormState)
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="token" value={token} />
      <TextField
        name="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN}
        hint={`At least ${PASSWORD_MIN} characters.`}
        error={state.fieldErrors?.password}
      />
      <SubmitButton pending={pending} pendingLabel="Saving">
        Save new password
      </SubmitButton>
    </form>
  )
}
