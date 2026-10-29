import type { Metadata } from "next"
import type { ReactNode } from "react"

// Sign-in pages are for people, not search results.
export const metadata: Metadata = { robots: { index: false, follow: false } }

export default function AuthLayout({ children }: { children: ReactNode }) {
  return children
}
