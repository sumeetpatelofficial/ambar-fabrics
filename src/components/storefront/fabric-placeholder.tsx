import { useId } from "react"
import { cn } from "cn"

export type FabricPattern = "weave" | "bandhani" | "ajrakh" | "stripe" | "block"

/**
 * Stand-in artwork until real product photography is uploaded. Draws a woven or printed texture in
 * the given colours so empty catalogues and tests still look like a textile store, not grey boxes.
 */
export function FabricPlaceholder({
  pattern = "weave",
  base = "#d9cdb4",
  ink = "#8a7a5c",
  className,
}: {
  pattern?: FabricPattern
  base?: string
  ink?: string
  className?: string
}) {
  const id = useId().replace(/:/g, "")
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={cn("size-full", className)}
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {pattern === "weave" && (
          <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill={base} />
            <path d="M0 0h3v3H0zM3 3h3v3H3z" fill={ink} opacity="0.28" />
            <path d="M3 0h3v3H3zM0 3h3v3H0z" fill={ink} opacity="0.1" />
          </pattern>
        )}
        {pattern === "bandhani" && (
          <pattern id={id} width="22" height="22" patternUnits="userSpaceOnUse">
            <rect width="22" height="22" fill={base} />
            <g fill={ink}>
              <circle cx="5.5" cy="5.5" r="2.2" />
              <circle cx="16.5" cy="5.5" r="1.1" opacity="0.6" />
              <circle cx="5.5" cy="16.5" r="1.1" opacity="0.6" />
              <circle cx="16.5" cy="16.5" r="2.2" />
            </g>
          </pattern>
        )}
        {pattern === "ajrakh" && (
          <pattern id={id} width="40" height="40" patternUnits="userSpaceOnUse">
            <rect width="40" height="40" fill={base} />
            <g fill="none" stroke={ink} strokeWidth="1.4">
              <path d="M20 3l17 17-17 17L3 20z" />
              <path d="M20 11l9 9-9 9-9-9z" />
              <circle cx="20" cy="20" r="2.4" fill={ink} />
            </g>
            <g fill={ink} opacity="0.55">
              <circle cx="0" cy="0" r="3" />
              <circle cx="40" cy="0" r="3" />
              <circle cx="0" cy="40" r="3" />
              <circle cx="40" cy="40" r="3" />
            </g>
          </pattern>
        )}
        {pattern === "stripe" && (
          <pattern id={id} width="18" height="18" patternUnits="userSpaceOnUse">
            <rect width="18" height="18" fill={base} />
            <rect width="3" height="18" fill={ink} opacity="0.55" />
            <rect x="9" width="1" height="18" fill={ink} opacity="0.35" />
          </pattern>
        )}
        {pattern === "block" && (
          <pattern id={id} width="30" height="30" patternUnits="userSpaceOnUse">
            <rect width="30" height="30" fill={base} />
            <g fill={ink} opacity="0.7">
              <path d="M15 5c3 4 3 8 0 12-3-4-3-8 0-12z" />
              <path
                d="M5 21c4 1 7 4 8 8-4-1-7-4-8-8zM25 21c-4 1-7 4-8 8 4-1 7-4 8-8z"
                opacity="0.7"
              />
            </g>
          </pattern>
        )}
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  )
}
