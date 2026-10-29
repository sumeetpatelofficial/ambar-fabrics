"use client"

import { ChoiceSelect } from "@/components/ui/choice-select"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useActionState, useEffect } from "react"
import { FormMessage } from "@/components/forms/form-message"
import { SubmitButton } from "@/components/forms/submit-button"
import { TextField } from "@/components/forms/text-field"
import { Label } from "@/components/ui/label"
import { saveAddressAction } from "@/features/account/actions"
import { initialFormState } from "@/features/form-state"
import { INDIAN_STATES } from "@/config/addresses"
import type { AddressDTO } from "@/services/account-service"

export function AddressForm({ address }: { address?: AddressDTO }) {
  const router = useRouter()
  const [state, action, pending] = useActionState(saveAddressAction, initialFormState)
  const v = (key: keyof AddressDTO & string) =>
    state.values?.[key] ?? (address?.[key] as string | undefined) ?? ""

  useEffect(() => {
    // After a successful save, return to the list (which re-reads the saved data).
    if (state.status === "success") {
      router.replace("/account/addresses")
      router.refresh()
    }
  }, [state.status, router])

  return (
    <form
      action={action}
      className="flex max-w-xl flex-col gap-5 border p-5 sm:p-6"
      noValidate
      aria-label={address ? "Edit address" : "Add an address"}
    >
      <h2 className="text-2xl">{address ? "Edit address" : "Add an address"}</h2>
      <FormMessage state={state} />
      {address ? <input type="hidden" name="id" value={address.id} /> : null}
      <TextField
        name="label"
        label="Label (optional)"
        defaultValue={v("label")}
        placeholder="Home, Work"
        error={state.fieldErrors?.label}
      />
      <TextField
        name="fullName"
        label="Recipient's name"
        autoComplete="name"
        required
        defaultValue={v("fullName")}
        error={state.fieldErrors?.fullName}
      />
      <TextField
        name="phone"
        label="Mobile number"
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        required
        defaultValue={v("phone")}
        hint="10 digits, for the delivery partner to call."
        error={state.fieldErrors?.phone}
      />
      <TextField
        name="line1"
        label="Address line 1"
        autoComplete="address-line1"
        required
        defaultValue={v("line1")}
        hint="House or flat number, building, street."
        error={state.fieldErrors?.line1}
      />
      <TextField
        name="line2"
        label="Address line 2 (optional)"
        autoComplete="address-line2"
        defaultValue={v("line2")}
        error={state.fieldErrors?.line2}
      />
      <TextField
        name="landmark"
        label="Landmark (optional)"
        defaultValue={v("landmark")}
        error={state.fieldErrors?.landmark}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          name="city"
          label="City or town"
          autoComplete="address-level2"
          required
          defaultValue={v("city")}
          error={state.fieldErrors?.city}
        />
        <TextField
          name="pincode"
          label="PIN code"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={6}
          required
          defaultValue={v("pincode")}
          error={state.fieldErrors?.pincode}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="state" className="text-sm">
          State
        </Label>
        <ChoiceSelect
          // A new key remounts it with the submitted value: the form is reset after each submit.
          key={state.values?.state ?? "initial"}
          id="state"
          name="state"
          required
          defaultValue={v("state")}
          aria-invalid={state.fieldErrors?.state ? true : undefined}
          aria-describedby={state.fieldErrors?.state ? "state-error" : undefined}
          className="h-11 text-base"
        >
          <option value="">Choose a state</option>
          {INDIAN_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </ChoiceSelect>
        {state.fieldErrors?.state ? (
          <p id="state-error" role="alert" className="text-sm text-destructive">
            {state.fieldErrors.state}
          </p>
        ) : null}
      </div>
      <div className="flex items-start gap-3">
        <input
          id="makeDefault"
          name="makeDefault"
          type="checkbox"
          defaultChecked={address?.isDefault}
          className="mt-1 size-5 accent-[var(--primary)]"
        />
        <Label htmlFor="makeDefault" className="text-[0.95rem] font-normal">
          Use as my default delivery address
        </Label>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton pending={pending} pendingLabel="Saving">
          {address ? "Save address" : "Add address"}
        </SubmitButton>
        <Link
          href="/account/addresses"
          className="inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Cancel
        </Link>
      </div>
    </form>
  )
}
