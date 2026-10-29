"use client"

import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"

/** Says what happened and what to do. Never shows internal detail; `reference` is the server digest. */
export function ErrorState({
  title = "Something went wrong",
  description = "We could not load this page. Please try again. If it keeps happening, come back in a few minutes.",
  reference,
  onRetry,
  action,
}: {
  title?: string
  description?: string
  reference?: string
  onRetry?: () => void
  action?: ReactNode
}) {
  return (
    <section
      role="alert"
      className="mx-auto flex w-full max-w-xl flex-col items-start gap-4 px-4 py-20 sm:px-6"
    >
      <h1 className="text-4xl">{title}</h1>
      <p className="text-pretty text-muted-foreground">{description}</p>
      {reference ? <p className="text-sm text-muted-foreground">Reference: {reference}</p> : null}
      <div className="flex flex-wrap gap-3">
        {onRetry ? <Button onClick={onRetry}>Try again</Button> : null}
        {action}
      </div>
    </section>
  )
}
