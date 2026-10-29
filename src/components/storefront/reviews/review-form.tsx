"use client"

import { useActionState } from "react"
import { FormMessage } from "@/components/forms/form-message"
import { SubmitButton } from "@/components/forms/submit-button"
import { TextField } from "@/components/forms/text-field"
import { Label } from "@/components/ui/label"
import { submitReviewAction } from "@/features/reviews/actions"
import { initialFormState } from "@/features/form-state"

type Existing = { rating: number; title?: string; body: string; status: string }

export function ReviewForm({ slug, existing }: { slug: string; existing?: Existing }) {
  const [state, action, pending] = useActionState(submitReviewAction, initialFormState)
  const e = state.fieldErrors ?? {}
  const v = (k: string, fallback = "") => state.values?.[k] ?? fallback
  const rating = Number(v("rating", existing ? String(existing.rating) : ""))
  return (
    <form
      action={action}
      noValidate
      aria-label="Write a review"
      className="flex max-w-xl flex-col gap-4 border p-5"
    >
      <h3 className="text-xl">{existing ? "Your review" : "Write a review"}</h3>
      {existing?.status === "pending" ? (
        <p className="text-sm text-muted-foreground">
          Waiting to be read by us. Changing it sends it back for reading.
        </p>
      ) : null}
      <FormMessage state={state} />
      <input type="hidden" name="slug" value={slug} />
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm">Your rating</legend>
        <div className="flex flex-wrap gap-3">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="flex cursor-pointer items-center gap-1.5 text-sm">
              <input
                type="radio"
                name="rating"
                value={n}
                defaultChecked={rating === n}
                className="size-4"
              />
              {n} {n === 1 ? "star" : "stars"}
            </label>
          ))}
        </div>
        {e.rating ? (
          <p role="alert" className="text-sm text-destructive">
            {e.rating}
          </p>
        ) : null}
      </fieldset>
      <TextField
        name="title"
        label="Headline (optional)"
        defaultValue={v("title", existing?.title ?? "")}
        error={e.title}
      />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="review-body" className="text-sm">
          Your review
        </Label>
        <textarea
          id="review-body"
          name="body"
          rows={5}
          defaultValue={v("body", existing?.body ?? "")}
          aria-invalid={e.body ? true : undefined}
          aria-describedby={e.body ? "review-body-error" : undefined}
          className="w-full border border-input bg-background px-3 py-2 text-base"
        />
        {e.body ? (
          <p id="review-body-error" role="alert" className="text-sm text-destructive">
            {e.body}
          </p>
        ) : null}
      </div>
      <div>
        <SubmitButton pending={pending} pendingLabel="Sending">
          {existing ? "Update review" : "Send review"}
        </SubmitButton>
      </div>
    </form>
  )
}
