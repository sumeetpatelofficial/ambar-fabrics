"use client"

import { useRouter } from "next/navigation"
import { useActionState, useState } from "react"
import { FormMessage } from "@/components/forms/form-message"
import { SubmitButton } from "@/components/forms/submit-button"
import { TextField } from "@/components/forms/text-field"
import { AreaField } from "@/components/admin/fields"
import { Button } from "@/components/ui/button"
import { resetPageAction, savePageAction } from "@/features/admin/actions"
import { initialFormState } from "@/features/form-state"

export function PageForm({
  slug,
  title,
  description,
  body,
  edited,
}: {
  slug: string
  title: string
  description: string
  body: string
  edited: boolean
}) {
  const router = useRouter()
  const [state, action, pending] = useActionState(savePageAction, initialFormState)
  const [message, setMessage] = useState("")
  const v = (k: string, fallback: string) => state.values?.[k] ?? fallback
  const e = state.fieldErrors ?? {}
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <form action={action} noValidate aria-label={`Edit ${title}`} className="flex flex-col gap-5">
        <FormMessage state={state} />
        <input type="hidden" name="slug" value={slug} />
        <TextField
          name="title"
          label="Title"
          required
          defaultValue={v("title", title)}
          error={e.title}
        />
        <TextField
          name="description"
          label="Short description (for search results)"
          defaultValue={v("description", description)}
          error={e.description}
        />
        <AreaField
          name="body"
          label="Text"
          rows={22}
          defaultValue={v("body", body)}
          error={e.body}
        />
        <div className="border p-4 text-sm text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">Formatting</p>
          <p>
            A blank line starts a new paragraph. Start a line with ## for a heading, or with - for a
            bullet. Write [label](/shipping-policy) for a link on this site, or
            [label](https://example.com) for another site. Nothing else is interpreted, and HTML is
            not allowed.
          </p>
        </div>
        <div>
          <SubmitButton pending={pending} pendingLabel="Saving">
            Save page
          </SubmitButton>
        </div>
      </form>
      {edited ? (
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              const r = await resetPageAction(slug)
              if (r.ok) router.refresh()
              else setMessage(r.message)
            }}
          >
            Go back to the original wording
          </Button>
          <p role="alert" className="text-sm text-destructive">
            {message}
          </p>
        </div>
      ) : null}
    </div>
  )
}
