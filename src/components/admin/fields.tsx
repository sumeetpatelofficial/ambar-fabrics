"use client"

import { useId, type ComponentProps, type ReactNode } from "react"
import { ChoiceSelect } from "@/components/ui/choice-select"
import { Label } from "@/components/ui/label"

const control =
  "w-full border border-input bg-background px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-ring"

function Wrap({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string
  label: string
  error?: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-sm">
        {label}
      </Label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

const describe = (id: string, error?: string, hint?: string) =>
  [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined

type Common = { name: string; label: string; error?: string; hint?: string }

export function SelectField({
  name,
  label,
  error,
  hint,
  children,
  ...rest
}: Common &
  Omit<ComponentProps<typeof ChoiceSelect>, "id" | "name" | "children" | "className"> & {
    children: ReactNode
  }) {
  const id = `${useId()}-${name}`
  return (
    <Wrap id={id} label={label} error={error} hint={hint}>
      <ChoiceSelect
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describe(id, error, hint)}
        className="h-11 text-base"
        {...rest}
      >
        {children}
      </ChoiceSelect>
    </Wrap>
  )
}

export function AreaField({
  name,
  label,
  error,
  hint,
  rows = 4,
  ...rest
}: Common & Omit<ComponentProps<"textarea">, "id" | "name">) {
  const id = `${useId()}-${name}`
  return (
    <Wrap id={id} label={label} error={error} hint={hint}>
      <textarea
        id={id}
        name={name}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describe(id, error, hint)}
        className={control}
        {...rest}
      />
    </Wrap>
  )
}

export function CheckField({
  name,
  label,
  defaultChecked,
  hint,
}: {
  name: string
  label: string
  defaultChecked?: boolean
  hint?: string
}) {
  const id = `${useId()}-${name}`
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-1 size-4"
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      <div>
        <Label htmlFor={id} className="text-sm">
          {label}
        </Label>
        {hint ? (
          <p id={`${id}-hint`} className="text-sm text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  )
}
