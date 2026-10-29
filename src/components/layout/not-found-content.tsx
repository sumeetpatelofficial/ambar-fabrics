import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "cn"

export function NotFoundContent() {
  return (
    <section className="mx-auto flex w-full max-w-xl flex-col items-start gap-4 px-4 py-20 sm:px-6">
      <h1 className="text-5xl">We could not find that page</h1>
      <p className="text-pretty text-muted-foreground">
        The link may be old, or the product may no longer be available. Browse the collection or go
        back to the start.
      </p>
      <div className="flex flex-wrap gap-3 pt-2">
        <Link href="/categories" className={cn(buttonVariants())}>
          Browse categories
        </Link>
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
          Back to home
        </Link>
      </div>
    </section>
  )
}
