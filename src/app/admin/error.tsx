"use client"

import { Button } from "@/components/ui/button"

// In this Next.js version the recovery callback is `retry` (not `reset`).
export default function AdminError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    <div
      role="alert"
      className="flex max-w-lg flex-col items-start gap-4 rounded-xl border bg-background p-8"
    >
      <h1 className="text-3xl">Something went wrong</h1>
      <p className="text-muted-foreground">
        This page could not be shown. Try again; if it keeps happening, note the reference below.
        {error.digest ? (
          <span className="mt-2 block text-xs">Reference: {error.digest}</span>
        ) : null}
      </p>
      <Button onClick={retry}>Try again</Button>
    </div>
  )
}
