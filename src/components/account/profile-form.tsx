"use client"

import { useActionState } from "react"
import { FormMessage } from "@/components/forms/form-message"
import { SubmitButton } from "@/components/forms/submit-button"
import { TextField } from "@/components/forms/text-field"
import { Label } from "@/components/ui/label"
import { updateProfileAction } from "@/features/account/actions"
import { initialFormState } from "@/features/form-state"
import type { ProfileDTO } from "@/services/account-service"

export function ProfileForm({ profile }: { profile: ProfileDTO }) {
  const [state, action, pending] = useActionState(updateProfileAction, initialFormState)
  const phone = state.values?.phone ?? profile.phone?.replace(/^\+91/, "") ?? ""
  return (
    <form action={action} className="flex max-w-lg flex-col gap-5" noValidate>
      <FormMessage state={state} />
      <TextField
        name="email"
        label="Email address"
        value={profile.email}
        readOnly
        disabled
        hint="To change your email address, contact us."
      />
      <TextField
        name="name"
        label="Your name"
        autoComplete="name"
        required
        defaultValue={state.values?.name ?? profile.name}
        error={state.fieldErrors?.name}
      />
      <TextField
        name="phone"
        label="Mobile number (optional)"
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        defaultValue={phone}
        hint="A 10-digit Indian mobile number, used for delivery updates."
        error={state.fieldErrors?.phone}
      />
      <div className="flex items-start gap-3">
        <input
          id="marketingEmail"
          name="marketingEmail"
          type="checkbox"
          defaultChecked={
            state.values ? state.values.marketingEmail === "on" : profile.marketingEmail
          }
          className="mt-1 size-5 accent-[var(--primary)]"
        />
        <Label htmlFor="marketingEmail" className="text-[0.95rem] leading-snug font-normal">
          Email me about new arrivals and offers. You can change this any time.
        </Label>
      </div>
      <SubmitButton pending={pending} pendingLabel="Saving" className="self-start">
        Save changes
      </SubmitButton>
    </form>
  )
}
