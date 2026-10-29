import { CircleAlert, CircleCheck } from "lucide-react"
import { cn } from "cn"
import type { FormState } from "@/features/form-state"

/** The result of a form as a whole. Errors interrupt (alert); success is announced politely (status). */
export function FormMessage({ state, className }: { state: FormState; className?: string }) {
  if (state.status === "idle" || !state.message) return null
  const error = state.status === "error"
  const Icon = error ? CircleAlert : CircleCheck
  return (
    <div
      role={error ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 border px-4 py-3 text-[0.95rem]",
        error
          ? "border-destructive/40 bg-destructive/5 text-destructive"
          : "border-primary/40 bg-primary/5 text-foreground",
        className
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <p>{state.message}</p>
    </div>
  )
}
