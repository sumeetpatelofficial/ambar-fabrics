import { handlers } from "@/lib/auth"

// Auth.js endpoints: OAuth callbacks, the session endpoint the header reads, sign-out and CSRF.
export const { GET, POST } = handlers
