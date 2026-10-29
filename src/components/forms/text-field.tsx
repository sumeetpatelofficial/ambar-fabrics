"use client"

import { useId, useState, type ComponentProps } from "react"
import { Eye, EyeOff } from "lucide-react"
import { cn } from "cn"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Props = Omit<ComponentProps<"input">, "id" | "name"> & {
  name: string
  label: string
  error?: string
  hint?: string
}

/**
 * A labelled input. The error and hint are tied to the input (aria-describedby), the error is announced
 * (role="alert") when it appears, and invalid inputs are flagged for assistive technology.
 */
export function TextField({ name, label, error, hint, className, type = "text", ...rest }: Props) {
  const uid = useId()
  const id = `${uid}-${name}`
  const describedBy =
    [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") ||
    undefined
  const [shown, setShown] = useState(false)
  const isPassword = type === "password"

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-sm">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          name={name}
          type={isPassword && shown ? "text" : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn("h-11 text-base", isPassword && "pr-12", className)}
          {...rest}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setShown((v) => !v)}
            aria-label={shown ? "Hide password" : "Show password"}
            aria-pressed={shown}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground"
          >
            {shown ? (
              <EyeOff aria-hidden="true" className="size-5" />
            ) : (
              <Eye aria-hidden="true" className="size-5" />
            )}
          </button>
        ) : null}
      </div>
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
