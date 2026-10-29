import { cn } from "cn"

/** Decorative measuring-tape rule. Hidden from assistive technology. */
export function Selvedge({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("selvedge w-full", className)} />
}
