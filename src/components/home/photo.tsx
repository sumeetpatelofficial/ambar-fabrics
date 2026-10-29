import Image from "next/image"
import type { ReactNode } from "react"
import { cn } from "cn"
import type { Photo, Tint } from "@/content/home"

/** The same colours as plain values, for animations (which cannot tween a CSS variable). Keep in step with globals.css. */
export const tintHex: Record<Tint, { arch: string; bg: string }> = {
  red: { arch: "#e8c9b5", bg: "#f3e6dc" },
  indigo: { arch: "#cbd0df", bg: "#e9ebf1" },
  sage: { arch: "#d4dccb", bg: "#ecefe6" },
  gold: { arch: "#e6d6ae", bg: "#f3ebd6" },
}

/** The arch and background colours of an outfit tint (CSS variables, see globals.css). */
export const tintVar = (tint: Tint) => ({
  arch: `var(--tint-${tint})`,
  bg: `var(--tint-${tint}-bg)`,
})

/**
 * A photograph filling its box, or a plain coloured panel until a photograph exists. The model photographs
 * share one framing (portrait, plain background), so they are cropped from near the top.
 */
export function PhotoOrTint({
  photo,
  color,
  sizes,
  priority = false,
  className,
  children,
}: {
  photo?: Photo
  color: string
  sizes: string
  priority?: boolean
  className?: string
  children?: ReactNode
}) {
  return (
    <div className={cn("absolute inset-0", className)} style={{ background: color }}>
      {photo ? (
        <Image
          src={photo.src}
          alt={photo.alt}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover object-[50%_15%]"
        />
      ) : (
        children
      )}
    </div>
  )
}
