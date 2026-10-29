"use client"

import { Area, AreaChart, ResponsiveContainer } from "recharts"
import { ACCENT } from "@/components/admin/colors"

/** A tiny trend line with no axes, for the sidebar card. Decorative: the figure beside it carries the meaning. */
export function Sparkline({ values }: { values: number[] }) {
  const data = values.map((v, i) => ({ i, v }))
  return (
    <div aria-hidden="true" className="h-12 w-full">
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 180, height: 48 }}>
        <AreaChart
          data={data}
          margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
          accessibilityLayer={false}
        >
          <defs>
            <linearGradient id="spark-green" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={ACCENT.green.solid} stopOpacity={0.35} />
              <stop offset="100%" stopColor={ACCENT.green.solid} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={ACCENT.green.solid}
            strokeWidth={2}
            fill="url(#spark-green)"
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
