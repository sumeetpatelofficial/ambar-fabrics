import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"

/** A missing admin page, shown inside the admin frame to people who are allowed in. */
export default function AdminNotFound() {
  return (
    <div className="flex max-w-lg flex-col items-start gap-4 rounded-xl border bg-background p-8">
      <h1 className="text-3xl">That admin page does not exist</h1>
      <p className="text-muted-foreground">It may have been removed, or the address is mistyped.</p>
      <Link href="/admin" className={buttonVariants()}>
        Back to the overview
      </Link>
    </div>
  )
}
