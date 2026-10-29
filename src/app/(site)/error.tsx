"use client"

import { useEffect } from "react"
import { ErrorState } from "@/components/storefront/error-state"

// In this Next.js version the recovery callback is `retry` (not `reset`).
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    // Error monitoring (Sentry) is wired in Phase 13. Only the digest is safe to correlate with server logs.
    console.error("Route error", error.digest)
  }, [error])

  return <ErrorState reference={error.digest} onRetry={retry} />
}
