import "server-only"
import {
  parseServerEnv,
  requireGroup as requireGroupFrom,
  isGroupConfigured as isConfiguredIn,
} from "./schema"
import type { ConfigGroup, ServerEnv } from "./schema"

let cached: ServerEnv | undefined

/** Parsed and validated server environment. Validated lazily at first use, then cached. */
export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env)
  return cached
}

export function requireGroup<G extends ConfigGroup>(group: G) {
  return requireGroupFrom(getServerEnv(), group)
}

export function isGroupConfigured(group: ConfigGroup) {
  return isConfiguredIn(getServerEnv(), group)
}

export { configGroups } from "./schema"
export type { ConfigGroup, ServerEnv } from "./schema"
