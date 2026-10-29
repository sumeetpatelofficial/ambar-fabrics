"use client"

import { useActionState } from "react"
import { FormMessage } from "@/components/forms/form-message"
import { SubmitButton } from "@/components/forms/submit-button"
import { TextField } from "@/components/forms/text-field"
import { Label } from "@/components/ui/label"
import { sendContactAction } from "@/features/content/actions"
import { initialFormState } from "@/features/form-state"

export function ContactForm() {
  const [state, action, pending] = useActionState(sendContactAction, initialFormState)
  const e = state.fieldErrors ?? {}
  const v = (k: string) => state.values?.[k] ?? ""
  return (
    <form
      action={action}
      noValidate
      aria-label="Send us a message"
      className="mt-10 flex max-w-xl flex-col gap-4"
    >
      <h2 className="text-2xl">Send us a message</h2>
      <FormMessage state={state} />
      <TextField
        name="name"
        label="Your name"
        autoComplete="name"
        required
        defaultValue={v("name")}
        error={e.name}
      />
      <TextField
        name="email"
        label="Your email address"
        type="email"
        autoComplete="email"
        required
        defaultValue={v("email")}
        error={e.email}
      />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="contact-message" className="text-sm">
          Message
        </Label>
        <textarea
          id="contact-message"
          name="message"
          rows={6}
          required
          defaultValue={v("message")}
          aria-invalid={e.message ? true : undefined}
          aria-describedby={e.message ? "contact-message-error" : undefined}
          className="w-full border border-input bg-background px-3 py-2 text-base"
        />
        {e.message ? (
          <p id="contact-message-error" role="alert" className="text-sm text-destructive">
            {e.message}
          </p>
        ) : null}
      </div>
      {/* A trap for bots: hidden from people and from assistive technology, so a real visitor never fills it. */}
      <div aria-hidden="true" className="absolute -left-[9999px]">
        <label>
          Leave this empty
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div>
        <SubmitButton pending={pending} pendingLabel="Sending">
          Send message
        </SubmitButton>
      </div>
    </form>
  )
}
