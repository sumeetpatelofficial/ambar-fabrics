import { z } from "zod"
import { ConfigError } from "@/lib/errors"

/**
 * Pure env parsing, with no `server-only` import, so it can be unit tested.
 * Server code reads env through `@/lib/env/server`; browser-safe values through `@/lib/env/public`.
 */

/** Treat empty strings (as in a copied .env.example) as "not set". */
function withoutBlanks(raw: Record<string, string | undefined>) {
  return Object.fromEntries(
    Object.entries(raw).filter(([, v]) => v !== undefined && v.trim() !== "")
  )
}

function describeIssues(error: z.ZodError) {
  // Variable names and rule text only. Never echo values, they may be secrets.
  return error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
}

const optionalSecret = (min: number) =>
  z.string().min(min, `must be at least ${min} characters`).optional()

// ---------------------------------------------------------------- public (browser-visible)

const publicSchema = z.object({
  NEXT_PUBLIC_APP_URL: z
    .url({ protocol: /^https?$/, message: "must be an absolute http(s) URL" })
    .transform((v) => v.replace(/\/+$/, "")),
  NEXT_PUBLIC_RAZORPAY_KEY_ID: z
    .string()
    .regex(/^rzp_(test|live)_[A-Za-z0-9]+$/, "must look like rzp_test_xxx or rzp_live_xxx")
    .optional(),
  NEXT_PUBLIC_GA_MEASUREMENT_ID: z
    .string()
    .regex(/^G-[A-Z0-9]+$/, "must look like G-XXXXXXXXXX")
    .optional(),
})

export type PublicEnv = z.infer<typeof publicSchema>

export function parsePublicEnv(
  raw: Record<string, string | undefined>,
  nodeEnv?: string
): PublicEnv {
  const input = withoutBlanks(raw)
  // A localhost default is a convenience for development and tests only.
  if (nodeEnv !== "production" && !input.NEXT_PUBLIC_APP_URL) {
    input.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  }
  const result = publicSchema.safeParse(input)
  if (!result.success) {
    throw new ConfigError(
      `Invalid public environment configuration:\n - ${describeIssues(result.error).join("\n - ")}`
    )
  }
  const { hostname, protocol } = new URL(result.data.NEXT_PUBLIC_APP_URL)
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1"
  // `next build` always runs as production, so local http is allowed for build-and-start checks only.
  if (nodeEnv === "production" && protocol !== "https:" && !isLocal) {
    throw new ConfigError(
      "Invalid public environment configuration:\n - NEXT_PUBLIC_APP_URL: must be https in production"
    )
  }
  return result.data
}

// ---------------------------------------------------------------- server

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).optional(),

  MONGODB_URI: z
    .string()
    .regex(/^mongodb(\+srv)?:\/\//, "must start with mongodb:// or mongodb+srv://")
    .optional(),

  AUTH_SECRET: optionalSecret(32),
  CRON_SECRET: optionalSecret(16),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),

  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: optionalSecret(8),

  SHIPROCKET_EMAIL: z.string().optional(),
  SHIPROCKET_PASSWORD: z.string().optional(),
  SHIPROCKET_PICKUP_LOCATION: z.string().optional(),
  SHIPROCKET_WEBHOOK_TOKEN: z.string().min(16, "must be at least 16 characters").optional(),
  /** The warehouse PIN code couriers collect from. */
  SHIPPING_ORIGIN_PINCODE: z
    .string()
    .regex(/^[1-9]\d{5}$/, "must be a 6-digit PIN code")
    .optional(),

  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  SENTRY_DSN: z.url().optional(),
})

export type ServerEnv = z.infer<typeof serverSchema>

/**
 * Integration groups. A group is "configured" only when every variable in it is set.
 * Features call `requireGroup` at their own boundary, so an unconfigured optional integration
 * degrades in development while payments, shipments, etc. refuse to run without their keys.
 */
export const configGroups = {
  database: ["MONGODB_URI"],
  auth: ["AUTH_SECRET"],
  cron: ["CRON_SECRET"],
  googleOAuth: ["AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"],
  razorpay: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"],
  shiprocket: ["SHIPROCKET_EMAIL", "SHIPROCKET_PASSWORD"],
  email: ["RESEND_API_KEY", "EMAIL_FROM"],
  cloudinary: ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"],
} as const satisfies Record<string, readonly (keyof ServerEnv)[]>

export type ConfigGroup = keyof typeof configGroups
type GroupValues<G extends ConfigGroup> = { [K in (typeof configGroups)[G][number]]: string }

export function parseServerEnv(raw: Record<string, string | undefined>): ServerEnv {
  const result = serverSchema.safeParse(withoutBlanks(raw))
  if (!result.success) {
    throw new ConfigError(
      `Invalid server environment configuration:\n - ${describeIssues(result.error).join("\n - ")}`
    )
  }
  return result.data
}

export function isGroupConfigured(env: ServerEnv, group: ConfigGroup): boolean {
  return configGroups[group].every((key) => Boolean(env[key]))
}

export function requireGroup<G extends ConfigGroup>(env: ServerEnv, group: G): GroupValues<G> {
  const keys: readonly (keyof ServerEnv)[] = configGroups[group]
  const missing = keys.filter((key) => !env[key]).map(String)
  if (missing.length > 0) {
    throw new ConfigError(`Missing configuration for "${group}": ${missing.join(", ")}`, missing)
  }
  return Object.fromEntries(keys.map((key) => [key, env[key]])) as GroupValues<G>
}
