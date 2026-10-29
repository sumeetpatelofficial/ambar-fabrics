import type { ReactNode } from "react"
import { cn } from "cn"

/** The standard page width and gutters (16 px on phones). */
export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("mx-auto w-full max-w-7xl bg-white px-4 py-8 sm:px-6", className)}>
      {children}
    </div>
  )
}
