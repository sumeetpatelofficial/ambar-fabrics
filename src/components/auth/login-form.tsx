"use client"

import Link from "next/link"
import { useActionState } from "react"
import { FormMessage } from "@/components/forms/form-message"
import { SubmitButton } from "@/components/forms/submit-button"
import { TextField } from "@/components/forms/text-field"
import { loginAction } from "@/features/auth/actions"
import { initialFormState } from "@/features/form-state"

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(loginAction, initialFormState)
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />
      {state.hint === "unverified" ? (
        <p className="text-[0.95rem]">
          <Link
            href={`/verify-email?email=${encodeURIComponent(state.values?.email ?? "")}`}
            className="underline underline-offset-4"
          >
            Send me a new confirmation link
          </Link>
        </p>
      ) : null}
      {next ? <input type="hidden" name="next" value={next} /> : null}
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
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />
      <SubmitButton pending={pending} pendingLabel="Signing in">
        Sign in
      </SubmitButton>
      <p className="text-[0.95rem]">
        <Link href="/forgot-password" className="underline underline-offset-4">
          Forgotten your password?
        </Link>
      </p>
    </form>
  )
}
