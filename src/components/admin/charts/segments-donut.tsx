"use client"

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts"
import { ACCENT } from "@/components/admin/colors"

type Segments = { new: number; returning: number; loyal: number }

const PARTS = [
  { key: "new", label: "New customers", color: ACCENT.green.solid },
  { key: "returning", label: "Returning customers", color: ACCENT.blue.solid },
  { key: "loyal", label: "Loyal customers (3 or more orders)", color: ACCENT.amber.solid },
] as const

/** Who bought in the period, as a coloured ring (Recharts) with the same numbers in a legend. */
export function SegmentsDonut({ segments }: { segments: Segments }) {
  const total = segments.new + segments.returning + segments.loyal
  const data = total
    ? PARTS.map((p) => ({ name: p.label, value: segments[p.key], color: p.color }))
    : [{ name: "No buyers", value: 1, color: "#eceff3" }]
  return (
    <div className="flex flex-col items-center gap-5">
      <div
        role="img"
        aria-label={
          total
            ? `${total} buyers: ${PARTS.map((p) => `${segments[p.key]} ${p.label.toLowerCase()}`).join(", ")}.`
            : "No buyers in this period."
        }
        className="relative size-48"
      >
        <div aria-hidden="true" className="size-full">
          <ResponsiveContainer
            width="100%"
            height="100%"
            initialDimension={{ width: 192, height: 192 }}
          >
            <PieChart accessibilityLayer={false}>
              <Pie
                rootTabIndex={-1}
                data={data}
                dataKey="value"
                innerRadius="68%"
                outerRadius="100%"
                paddingAngle={total ? 2 : 0}
                stroke="none"
                isAnimationActive={false}
                startAngle={90}
                endAngle={-270}
              >
                {data.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
        >
          <span className="tabular text-3xl">{total}</span>
          <span className="text-xs text-muted-foreground">buyers</span>
        </div>
      </div>
      <ul className="flex w-full flex-col gap-2 text-sm">
        {PARTS.map((p) => (
          <li key={p.key} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-full"
              style={{ backgroundColor: p.color }}
            />
            <span className="flex-1 text-muted-foreground">{p.label}</span>
            <span className="tabular">
              {total ? Math.round((segments[p.key] / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
