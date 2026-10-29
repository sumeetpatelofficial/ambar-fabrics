/** What a form action returns. Client-safe: no server imports here. */
export type FormState = {
  status: "idle" | "success" | "error"
  /** A message for the whole form (a success notice, or an error not tied to one field). */
  message?: string
  fieldErrors?: Record<string, string>
  /** Submitted values to put back in the inputs after an error. Passwords are never included. */
  values?: Record<string, string>
  /** Extra hint for the UI, for example offering to resend a confirmation email. */
  hint?: "unverified"
}

export const initialFormState: FormState = { status: "idle" }
