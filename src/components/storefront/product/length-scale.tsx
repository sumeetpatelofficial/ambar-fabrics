"use client"

import { motion } from "motion/react"
import { scaleMaxMm } from "@/features/catalog/purchase"

/**
 * A measuring-tape ruler that fills as the length grows: the selvedge motif doing real work. It only
 * mirrors the typed length (which is the accessible control), so it is hidden from assistive technology.
 */
export function LengthScale({ qtyMm }: { qtyMm: number }) {
  const max = scaleMaxMm(qtyMm)
  const percent = Math.min(100, (qtyMm / max) * 100)
  const labelEvery = max <= 6000 ? 1000 : 2000
  const labels: number[] = []
  for (let mm = 0; mm <= max; mm += labelEvery) labels.push(mm)

  return (
    <div aria-hidden="true" className="pt-1 select-none">
      <div className="relative h-7 overflow-hidden border-b border-foreground/30 bg-muted/60">
        <motion.div
          className="absolute inset-y-0 left-0 border-r-2 border-primary bg-primary/20"
          initial={false}
          animate={{ width: `${percent}%` }}
          transition={{ type: "spring", stiffness: 260, damping: 30 }}
        />
        <div className="selvedge absolute inset-x-0 top-0 !opacity-80" />
      </div>
      <div className="tabular relative mt-1 h-4 text-[0.7rem] text-muted-foreground">
        {labels.map((mm) => (
          <span
            key={mm}
            className="absolute -translate-x-1/2 whitespace-nowrap first:translate-x-0 last:-translate-x-full"
            style={{ left: `${(mm / max) * 100}%` }}
          >
            {mm === 0 ? "0" : `${mm / 1000} m`}
          </span>
        ))}
      </div>
    </div>
  )
}
