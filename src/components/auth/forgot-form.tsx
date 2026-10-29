"use client"

import { useActionState } from "react"
import { FormMessage } from "@/components/forms/form-message"
import { SubmitButton } from "@/components/forms/submit-button"
import { TextField } from "@/components/forms/text-field"
import { forgotPasswordAction } from "@/features/auth/actions"
import { initialFormState } from "@/features/form-state"

export function ForgotForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, initialFormState)
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
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <SubmitButton pending={pending} pendingLabel="Sending">
        Email me a reset link
      </SubmitButton>
    </form>
  )
}
