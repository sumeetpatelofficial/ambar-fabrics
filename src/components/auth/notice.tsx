import { CircleAlert, CircleCheck } from "lucide-react"
import { cn } from "cn"

/** A message set by the server from the URL (for example "password updated"). */
export function Notice({ tone, children }: { tone: "success" | "error"; children: string }) {
  const Icon = tone === "error" ? CircleAlert : CircleCheck
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 border px-4 py-3 text-[0.95rem]",
        tone === "error"
          ? "border-destructive/40 bg-destructive/5 text-destructive"
          : "border-primary/40 bg-primary/5"
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <p>{children}</p>
    </div>
  )
}
