"use client"

import { useRouter } from "next/navigation"
import { useActionState, useEffect, useState } from "react"
import { FormMessage } from "@/components/forms/form-message"
import { SubmitButton } from "@/components/forms/submit-button"
import { TextField } from "@/components/forms/text-field"
import { SelectField } from "@/components/admin/fields"
import { Button } from "@/components/ui/button"
import { deleteRedirectAction, saveRedirectAction } from "@/features/admin/actions"
import { initialFormState } from "@/features/form-state"

export function RedirectForm() {
  const router = useRouter()
  const [state, action, pending] = useActionState(saveRedirectAction, initialFormState)
  const e = state.fieldErrors ?? {}
  useEffect(() => {
    if (state.status === "success") router.refresh()
  }, [state, router])
  return (
    <form
      action={action}
      noValidate
      aria-label="Add a redirect"
      className="flex max-w-xl flex-col gap-4"
    >
      <FormMessage state={state} />
      <TextField
        name="fromPath"
        label="Old address"
        placeholder="/products/old-name"
        defaultValue={state.values?.fromPath}
        error={e.fromPath}
        hint="A product, category or collection address that no longer exists."
      />
      <TextField
        name="toPath"
        label="Send visitors to"
        placeholder="/products/new-name"
        defaultValue={state.values?.toPath}
        error={e.toPath}
      />
      <SelectField
        name="kind"
        label="Kind"
        defaultValue="permanent"
        hint="Permanent tells search engines to move the page's standing to the new address."
      >
        <option value="permanent">Permanent (the page has moved for good)</option>
        <option value="temporary">Temporary</option>
      </SelectField>
      <div>
        <SubmitButton pending={pending} pendingLabel="Saving">
          Save redirect
        </SubmitButton>
      </div>
    </form>
  )
}

export function DeleteRedirectButton({ id, from }: { id: string; from: string }) {
  const router = useRouter()
  const [message, setMessage] = useState("")
  return (
    <span className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="outline"
        aria-label={`Delete the redirect from ${from}`}
        onClick={async () => {
          const r = await deleteRedirectAction(id)
          if (r.ok) router.refresh()
          else setMessage(r.message)
        }}
      >
        Delete
      </Button>
      <span role="alert" className="text-xs text-destructive">
        {message}
      </span>
    </span>
  )
}
