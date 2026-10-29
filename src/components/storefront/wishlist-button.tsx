"use client"

import { useState } from "react"
import { Heart } from "lucide-react"
import { motion } from "motion/react"
import { cn } from "cn"

/**
 * Heart toggle. Controlled when `pressed` is passed, otherwise keeps its own state. Persistence is
 * wired by the caller through `onPressedChange` (account wishlist arrives in Phase 5).
 */
export function WishlistButton({
  productName,
  pressed,
  onPressedChange,
  disabled,
  className,
}: {
  productName: string
  pressed?: boolean
  onPressedChange?: (next: boolean) => void
  /** True while a change is being saved. */
  disabled?: boolean
  className?: string
}) {
  const [inner, setInner] = useState(false)
  const isPressed = pressed ?? inner

  return (
    <motion.button
      type="button"
      aria-pressed={isPressed}
      disabled={disabled}
      aria-label={`${isPressed ? "Remove" : "Add"} ${productName} ${isPressed ? "from" : "to"} wishlist`}
      onClick={() => {
        const next = !isPressed
        setInner(next)
        onPressedChange?.(next)
      }}
      // Feedback only on the tap itself; MotionConfig(reducedMotion="user") disables it for those who opt out.
      whileTap={{ scale: 0.82 }}
      transition={{ type: "spring", stiffness: 500, damping: 20 }}
      className={cn(
        "flex size-8 cursor-pointer items-center justify-center rounded-full bg-background/90 text-foreground transition-colors hover:bg-background disabled:cursor-default",
        className
      )}
    >
      <Heart className={cn("size-4", isPressed && "fill-madder text-madder")} aria-hidden="true" />
    </motion.button>
  )
}
