/**
 * Application error types. `message` is always safe to show to a user; internal detail goes to the
 * logger, never into an error message or response body.
 */
export class AppError extends Error {
  readonly code: string
  readonly status: number
  readonly details?: unknown

  constructor(code: string, message: string, status = 500, details?: unknown) {
    super(message)
    this.name = "AppError" // explicit: class names are minified in production builds
    this.code = code
    this.status = status
    this.details = details
  }
}

/** A required integration or secret is not configured. Names only, never values. */
export class ConfigError extends AppError {
  readonly missing: string[]

  constructor(message: string, missing: string[] = []) {
    super("CONFIG_INVALID", message, 503)
    this.name = "ConfigError"
    this.missing = missing
  }
}

export class DatabaseUnavailableError extends AppError {
  constructor() {
    super(
      "DB_UNAVAILABLE",
      "The service is temporarily unavailable. Please try again shortly.",
      503
    )
    this.name = "DatabaseUnavailableError"
  }
}

export class NotFoundError extends AppError {
  constructor(message = "We could not find that.") {
    super("NOT_FOUND", message, 404)
    this.name = "NotFoundError"
  }
}

/** Input failed validation. `details` lists field paths and plain-language problems. */
export class ValidationError extends AppError {
  constructor(message = "Some of the information is not valid.", details?: unknown) {
    super("VALIDATION_ERROR", message, 422, details)
    this.name = "ValidationError"
  }
}

const DB_UNAVAILABLE_NAMES = new Set([
  "MongoServerSelectionError",
  "MongooseServerSelectionError",
  "MongoNetworkError",
  "MongoNetworkTimeoutError",
  "MongoNotConnectedError",
  "MongoTopologyClosedError",
])

/** True for driver errors that mean "the database cannot be reached right now" (not a bug in a query). */
export function isDatabaseUnavailable(error: unknown): boolean {
  return (
    error instanceof DatabaseUnavailableError ||
    (error instanceof Error && DB_UNAVAILABLE_NAMES.has(error.name))
  )
}

export class UnauthorizedError extends AppError {
  constructor(message = "Please sign in to continue.") {
    super("UNAUTHENTICATED", message, 401)
    this.name = "UnauthorizedError"
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to do that.") {
    super("FORBIDDEN", message, 403)
    this.name = "ForbiddenError"
  }
}

export class TooManyRequestsError extends AppError {
  readonly retryAfterSeconds: number
  constructor(
    retryAfterSeconds: number,
    message = "Too many attempts. Please wait a little and try again."
  ) {
    super("RATE_LIMITED", message, 429)
    this.name = "TooManyRequestsError"
    this.retryAfterSeconds = retryAfterSeconds
  }
}
