"use client"

import { Slider } from "@base-ui/react/slider"
import { cn } from "cn"

/**
 * A slider with two handles, for choosing a lowest and a highest value. Each handle is its own
 * keyboard-operable slider (arrows move by one step, Page Up and Page Down by ten).
 */
export function RangeSlider({
  min,
  max,
  value,
  onValueChange,
  onValueCommitted,
  step = 1,
  labels,
  formatValue,
  className,
}: {
  min: number
  max: number
  value: [number, number]
  onValueChange: (value: [number, number]) => void
  /** Called when a handle is let go or a key press ends: the moment to apply the choice. */
  onValueCommitted?: (value: [number, number]) => void
  step?: number
  /** Accessible names of the two handles, for example ["Lowest price", "Highest price"]. */
  labels: [string, string]
  formatValue?: (value: number) => string
  className?: string
}) {
  const pair = (v: readonly number[]): [number, number] => [v[0] ?? min, v[1] ?? max]
  return (
    <Slider.Root
      min={min}
      max={max}
      step={step}
      largeStep={step * 10}
      value={value}
      minStepsBetweenValues={0}
      thumbCollisionBehavior="none"
      thumbAlignment="edge"
      onValueChange={(v) => onValueChange(pair(v))}
      onValueCommitted={(v) => onValueCommitted?.(pair(v))}
      className={cn("w-full", className)}
    >
      <Slider.Control className="flex h-9 w-full touch-none items-center select-none">
        <Slider.Track className="relative h-1.5 w-full rounded-full bg-muted">
          <Slider.Indicator className="rounded-full bg-primary" />
          {[0, 1].map((i) => (
            <Slider.Thumb
              key={i}
              index={i}
              getAriaLabel={() => labels[i]!}
              getAriaValueText={formatValue ? (_text, v) => formatValue(v) : undefined}
              className="size-5 rounded-full border-2 border-primary bg-background shadow-sm transition-shadow outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-[dragging]:ring-3 data-[dragging]:ring-ring/40"
            />
          ))}
        </Slider.Track>
      </Slider.Control>
    </Slider.Root>
  )
}
