"use client"

import { Children, isValidElement, useState, type ReactElement, type ReactNode } from "react"
import { cn } from "cn"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type Option = { value: string; label: string; disabled?: boolean }

/** An empty value ("Any status", "Choose a state") cannot be a Base UI item value, so it travels as this stand-in. */
const EMPTY = "__empty__"
const toItem = (v: string) => (v === "" ? EMPTY : v)
const fromItem = (v: unknown) => (v === EMPTY || v === null || v === undefined ? "" : String(v))

function text(node: ReactNode): string {
  return Children.toArray(node)
    .map((c) => (typeof c === "string" || typeof c === "number" ? String(c) : ""))
    .join("")
}

/** Reads `<option>` children, so a list is written the same way as for a native select. */
function optionsFrom(children: ReactNode): Option[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement(child) || child.type !== "option") return []
    const el = child as ReactElement<{
      value?: string | number
      disabled?: boolean
      children?: ReactNode
    }>
    const label = text(el.props.children)
    return [
      {
        value: el.props.value !== undefined ? String(el.props.value) : label,
        label,
        disabled: el.props.disabled,
      },
    ]
  })
}

/**
 * The shop's drop-down list: the shadcn Select, used the way a native `<select>` is. Give it `<option>`
 * children, `name` for a form post, `value` or `defaultValue`, and `onChange` (which receives the value).
 */
export function ChoiceSelect({
  name,
  id,
  value,
  defaultValue,
  onChange,
  disabled,
  required,
  children,
  className,
  placeholder,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: {
  name?: string
  id?: string
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  disabled?: boolean
  /** Marked as required for assistive technology; the server still checks the value. */
  required?: boolean
  children: ReactNode
  /** Sizes and spacing of the box that shows the choice (for example `h-10 w-full`). */
  className?: string
  placeholder?: string
  "aria-label"?: string
  "aria-invalid"?: boolean
  "aria-describedby"?: string
}) {
  const options = optionsFrom(children)
  const [inner, setInner] = useState(defaultValue ?? options[0]?.value ?? "")
  const current = value ?? inner
  const items = options.map((o) => ({ value: toItem(o.value), label: o.label }))

  return (
    <>
      {name ? <input type="hidden" name={name} value={current} /> : null}
      <Select
        items={items}
        value={toItem(current)}
        disabled={disabled}
        onValueChange={(next) => {
          const v = fromItem(next)
          setInner(v)
          onChange?.(v)
        }}
      >
        <SelectTrigger
          id={id}
          data-size="custom"
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          aria-required={required || undefined}
          aria-describedby={ariaDescribedBy}
          className={cn("h-10 w-full cursor-pointer bg-background px-3 text-sm", className)}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} className="min-w-(--anchor-width)">
          {items.map((o, i) => (
            <SelectItem key={o.value} value={o.value} disabled={options[i]?.disabled}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  )
}
