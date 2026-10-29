import { cacheLife } from "next/cache"

// The year is time-dependent, so it is computed inside a cache entry that refreshes daily instead of
// being frozen at build time (Cache Components rejects a bare `new Date()` during prerendering).
export async function CurrentYear() {
  "use cache"
  cacheLife("days")
  return <>{new Date().getFullYear()}</>
}
