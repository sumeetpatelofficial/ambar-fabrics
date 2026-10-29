import type { ReactNode } from "react"

/** The narrow centred column all sign-in style pages share. */
export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-12 sm:py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl">{title}</h1>
        {description ? <p className="text-pretty text-muted-foreground">{description}</p> : null}
      </header>
      {children}
      {footer ? (
        <div className="border-t pt-6 text-[0.95rem] text-muted-foreground">{footer}</div>
      ) : null}
    </div>
  )
}
