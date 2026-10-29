import type { Metadata } from "next"
import { Suspense, type ReactNode } from "react"
import { AdminShell } from "@/components/admin/admin-shell"
import { Skeleton } from "@/components/ui/skeleton"

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } }

/** The admin has its own frame (sidebar and top bar); the shop's header and footer are not part of it. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh bg-muted p-8">
          <Skeleton className="h-96 w-full" />
        </div>
      }
    >
      <AdminShell>{children}</AdminShell>
    </Suspense>
  )
}
