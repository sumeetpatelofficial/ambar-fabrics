import { Suspense, type ReactNode } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { Crumbs, type Crumb } from "@/components/admin/crumbs"
import type { Permission } from "@/config/permissions"
import { requireStaffPage, toActor } from "@/lib/auth/session"
import type { Actor } from "@/lib/security/authorize"

type Ctx<P> = { actor: Actor; props: P }

/**
 * Wraps an admin page: waits behind a skeleton, requires staff with `permission` (anyone else sees the
 * same 404 as a missing page), then renders. The services check the permission again on every read and write.
 */
export function staffPage<P>(
  permission: Permission | undefined,
  render: (ctx: Ctx<P>) => Promise<ReactNode>,
  options: { bare?: boolean } = {}
) {
  async function Inner(props: P) {
    const user = await requireStaffPage(permission)
    const content = await render({ actor: toActor(user), props })
    // Working pages sit on a white sheet; the overview lays out its own cards.
    return options.bare ? (
      <>{content}</>
    ) : (
      <div className="rounded-xl border bg-background p-5 sm:p-8 print:border-0 print:p-0">
        {content}
      </div>
    )
  }
  return function Page(props: P) {
    return (
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <Inner {...(props as P & object)} />
      </Suspense>
    )
  }
}

export function PageTitle({
  title,
  children,
  crumbs,
}: {
  title: string
  children?: ReactNode
  /** The trail above this page, ending with the page itself. Shows a Back link to the page above. */
  crumbs?: Crumb[]
}) {
  return (
    <>
      {crumbs ? <Crumbs trail={crumbs} /> : null}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-4xl">{title}</h1>
        {children}
      </div>
    </>
  )
}
