"use client"

import { useActionState } from "react"
import { FormMessage } from "@/components/forms/form-message"
import { SubmitButton } from "@/components/forms/submit-button"
import { TextField } from "@/components/forms/text-field"
import { AreaField, SelectField } from "@/components/admin/fields"
import { saveTaxonAction } from "@/features/admin/actions"
import { initialFormState } from "@/features/form-state"

export function TaxonForm({
  kind,
  values,
}: {
  kind: "fabric" | "print"
  values: Record<string, string>
}) {
  const [state, action, pending] = useActionState(saveTaxonAction, initialFormState)
  const v = (k: string) => state.values?.[k] ?? values[k] ?? ""
  const e = state.fieldErrors ?? {}
  return (
    <form
      action={action}
      noValidate
      aria-label={kind === "fabric" ? "Fabric" : "Print"}
      className="flex max-w-xl flex-col gap-5"
    >
      <FormMessage state={state} />
      <input type="hidden" name="kind" value={kind} />
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <TextField
        name="name"
        label="Name"
        required
        defaultValue={v("name")}
        error={e.name}
        hint={
          kind === "fabric"
            ? "For example Cotton, Crepe, Gaji silk, Modal silk."
            : "For example Bandhani, Ajrakh, Block print."
        }
      />
      <TextField
        name="slug"
        label="Web address"
        defaultValue={v("slug")}
        error={e.slug}
        hint="Leave blank to make it from the name."
      />
      <AreaField
        name="description"
        label="Description (shown on its page in the shop)"
        defaultValue={v("description")}
        error={e.description}
        rows={4}
      />
      <SelectField
        key={`status-${v("status")}`}
        name="status"
        label="Status"
        defaultValue={v("status") || "active"}
        hint="Hidden ones stay on the products that use them but get no page in the shop."
      >
        <option value="active">Shown</option>
        <option value="hidden">Hidden</option>
      </SelectField>
      <div>
        <SubmitButton pending={pending} pendingLabel="Saving">
          Save {kind}
        </SubmitButton>
      </div>
    </form>
  )
}
