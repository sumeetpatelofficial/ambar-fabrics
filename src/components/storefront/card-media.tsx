"use client"

import { useState, type ReactNode } from "react"
import { cn } from "cn"
import { motion, useReducedMotion } from "motion/react"

/**
 * Product card image area. On hover or keyboard focus of the card, the second photo fades in (the
 * fabric's drape or detail). Touch devices and reduced-motion users get the first image, or an instant
 * swap. Pass `<Image>` elements (or a placeholder) as `primary` and `secondary`.
 */
export function CardMedia({
  primary,
  secondary,
  ratio = "square",
}: {
  primary: ReactNode
  secondary?: ReactNode
  ratio?: "square" | "portrait"
}) {
  const [revealed, setRevealed] = useState(false)
  const reduce = useReducedMotion()

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[2px] bg-muted",
        ratio === "portrait" ? "aspect-[4/5]" : "aspect-square"
      )}
      onPointerEnter={(e) => e.pointerType === "mouse" && setRevealed(true)}
      onPointerLeave={() => setRevealed(false)}
      onFocusCapture={() => setRevealed(true)}
      onBlurCapture={() => setRevealed(false)}
    >
      <div className="absolute inset-0">{primary}</div>
      {secondary ? (
        <motion.div
          className="absolute inset-0"
          initial={false}
          animate={{ opacity: revealed ? 1 : 0 }}
          transition={{ duration: reduce ? 0 : 0.4, ease: "easeOut" }}
        >
          {secondary}
        </motion.div>
      ) : null}
    </div>
  )
}
