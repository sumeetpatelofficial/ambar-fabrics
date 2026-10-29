import type { Metadata } from "next"
import { Suspense, type ReactNode } from "react"
import { AccountNav } from "@/components/account/account-nav"
import { Container } from "@/components/layout/container"

// Private pages: never indexed. Each page checks the session itself; nothing here is shown without it.
export const metadata: Metadata = { robots: { index: false, follow: false } }

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <Container>
      <div className="grid gap-8 lg:grid-cols-[14rem_1fr] lg:gap-12 print:block">
        <aside className="print:hidden">
          <Suspense fallback={null}>
            <AccountNav />
          </Suspense>
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </Container>
  )
}
