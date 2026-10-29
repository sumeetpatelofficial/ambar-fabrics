"use client"

import { useActionState } from "react"
import { FormMessage } from "@/components/forms/form-message"
import { SubmitButton } from "@/components/forms/submit-button"
import { TextField } from "@/components/forms/text-field"
import { registerAction } from "@/features/auth/actions"
import { initialFormState } from "@/features/form-state"
import { PASSWORD_MIN } from "@/lib/security/password-policy"

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, initialFormState)
  if (state.status === "success") {
    return (
      <div className="flex flex-col gap-4">
        <FormMessage state={state} />
        <p className="text-pretty text-muted-foreground">
          The link works for 24 hours. Check your spam folder if it does not arrive within a few
          minutes.
        </p>
      </div>
    )
  }
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />
      <TextField
        name="name"
        label="Your name"
        autoComplete="name"
        required
        defaultValue={state.values?.name}
        error={state.fieldErrors?.name}
      />
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
      <TextField
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN}
        hint={`At least ${PASSWORD_MIN} characters. A few words together is easy to remember and hard to guess.`}
        error={state.fieldErrors?.password}
      />
      <SubmitButton pending={pending} pendingLabel="Creating your account">
        Create account
      </SubmitButton>
    </form>
  )
}
