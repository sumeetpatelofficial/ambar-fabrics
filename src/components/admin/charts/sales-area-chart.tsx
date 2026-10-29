"use client"

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { ACCENT } from "@/components/admin/colors"
import { formatPaise } from "@/lib/money"

type Point = { date: string; revenuePaise: number }

const compact = (paise: number) => {
  const r = paise / 100
  return r >= 100_000
    ? `₹${+(r / 100_000).toFixed(1)}L`
    : r >= 1000
      ? `₹${+(r / 1000).toFixed(1)}K`
      : `₹${Math.round(r)}`
}
const day = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`)
  )

function Tip({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  if (!active || !payload?.length) return null
  const p = payload[0]!.payload
  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-sm shadow-md">
      <p className="text-xs text-muted-foreground">{day(p.date)}</p>
      <p className="tabular font-medium">{formatPaise(p.revenuePaise)}</p>
    </div>
  )
}

/**
 * Daily sales as a blue area chart (Recharts). The chart itself is hidden from assistive technology; the
 * same figures follow as a table, and the picture has a spoken summary.
 */
export function SalesAreaChart({ series }: { series: Point[] }) {
  const total = series.reduce((n, p) => n + p.revenuePaise, 0)
  const best = series.reduce(
    (a, b) => (b.revenuePaise > a.revenuePaise ? b : a),
    series[0] ?? { date: "", revenuePaise: 0 }
  )
  const every = Math.max(0, Math.ceil(series.length / 7) - 1)
  return (
    <figure className="flex flex-col gap-2">
      <div
        role="img"
        aria-label={`Sales by day, ${series.length} days, ${formatPaise(total)} in total${total > 0 ? `, highest on ${day(best.date)} at ${formatPaise(best.revenuePaise)}` : ""}.`}
        className="h-[260px] w-full"
      >
        <div aria-hidden="true" className="h-full w-full">
          <ResponsiveContainer
            width="100%"
            height="100%"
            initialDimension={{ width: 720, height: 260 }}
          >
            <AreaChart
              data={series}
              margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
              accessibilityLayer={false}
            >
              <defs>
                <linearGradient id="sales-blue" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={ACCENT.blue.solid} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={ACCENT.blue.solid} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#e5e7eb" strokeDasharray="3 4" />
              <XAxis
                dataKey="date"
                tickFormatter={day}
                interval={every}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: "#66615a" }}
                tickMargin={8}
              />
              <YAxis
                tickFormatter={compact}
                tickLine={false}
                axisLine={false}
                width={52}
                tick={{ fontSize: 12, fill: "#66615a" }}
              />
              <Tooltip
                content={<Tip />}
                cursor={{ stroke: ACCENT.blue.solid, strokeDasharray: "3 3" }}
              />
              <Area
                type="monotone"
                dataKey="revenuePaise"
                stroke={ACCENT.blue.solid}
                strokeWidth={2.5}
                fill="url(#sales-blue)"
                dot={false}
                activeDot={{ r: 5, fill: ACCENT.blue.solid, stroke: "#fff", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      <figcaption className="sr-only">Sales by day</figcaption>
      <table className="sr-only">
        <caption>Sales by day</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Sales</th>
          </tr>
        </thead>
        <tbody>
          {series.map((p) => (
            <tr key={p.date}>
              <th scope="row">{day(p.date)}</th>
              <td>{formatPaise(p.revenuePaise)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
