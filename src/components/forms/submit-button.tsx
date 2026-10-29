"use client"

import type { ComponentProps } from "react"
import { Button } from "@/components/ui/button"

/** Disables itself and changes its label while the form is being processed, so it cannot be double-submitted. */
export function SubmitButton({
  children,
  pending,
  pendingLabel = "Please wait",
  ...rest
}: ComponentProps<typeof Button> & { pending: boolean; pendingLabel?: string }) {
  return (
    <Button type="submit" size="lg" disabled={pending} aria-disabled={pending} {...rest}>
      {pending ? pendingLabel : children}
    </Button>
  )
}
