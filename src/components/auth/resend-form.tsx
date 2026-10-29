"use client"

import { useActionState } from "react"
import { FormMessage } from "@/components/forms/form-message"
import { SubmitButton } from "@/components/forms/submit-button"
import { TextField } from "@/components/forms/text-field"
import { resendVerificationAction } from "@/features/auth/actions"
import { initialFormState } from "@/features/form-state"

export function ResendForm({ email }: { email?: string }) {
  const [state, action, pending] = useActionState(resendVerificationAction, initialFormState)
  if (state.status === "success") return <FormMessage state={state} />
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />
      <TextField
        name="email"
        label="Email address"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={state.values?.email ?? email}
        error={state.fieldErrors?.email}
      />
      <SubmitButton pending={pending} pendingLabel="Sending">
        Send a new link
      </SubmitButton>
    </form>
  )
}
