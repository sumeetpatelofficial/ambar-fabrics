"use client"

import { useActionState } from "react"
import { FormMessage } from "@/components/forms/form-message"
import { SubmitButton } from "@/components/forms/submit-button"
import { TextField } from "@/components/forms/text-field"
import { changePasswordAction } from "@/features/account/actions"
import { initialFormState } from "@/features/form-state"
import { PASSWORD_MIN } from "@/lib/security/password-policy"

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, initialFormState)
  return (
    <form action={action} className="flex max-w-lg flex-col gap-5" noValidate>
      <FormMessage state={state} />
      <TextField
        name="currentPassword"
        label="Current password"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.currentPassword}
      />
      <TextField
        name="newPassword"
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN}
        hint={`At least ${PASSWORD_MIN} characters. You will stay signed in here and be signed out on your other devices.`}
        error={state.fieldErrors?.newPassword}
      />
      <SubmitButton pending={pending} pendingLabel="Saving" className="self-start">
        Change password
      </SubmitButton>
    </form>
  )
}
