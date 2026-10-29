"use client"

// Replaces the root layout when it crashes, so it must render <html> and <body> and cannot rely on
// the app's stylesheet or fonts. Keep it minimal and self-contained.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    <html lang="en-IN">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          background: "#fbf8f2",
          color: "#26241f",
          margin: 0,
          padding: "6rem 1.5rem",
        }}
      >
        <h1 style={{ fontSize: "1.75rem", margin: 0 }}>Something went wrong</h1>
        <p style={{ maxWidth: "32rem" }}>
          Please try again. If the problem continues, come back shortly.
        </p>
        {error.digest ? <p style={{ fontSize: "0.75rem" }}>Reference: {error.digest}</p> : null}
        <button
          onClick={() => retry()}
          style={{
            background: "#465a40",
            color: "#fbf8f2",
            border: 0,
            borderRadius: 6,
            padding: "0.6rem 1rem",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  )
}
