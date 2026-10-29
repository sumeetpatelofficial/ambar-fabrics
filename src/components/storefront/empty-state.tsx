import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { cn } from "cn"

/** An empty screen is an invitation to act: say what is missing and offer the next step. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-3 border px-6 py-12 sm:items-center sm:text-center",
        className
      )}
    >
      {Icon ? (
        <Icon className="size-8 text-muted-foreground" aria-hidden="true" strokeWidth={1.25} />
      ) : null}
      <h2 className="text-2xl">{title}</h2>
      {description ? (
        <p className="max-w-prose text-pretty text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  )
}
