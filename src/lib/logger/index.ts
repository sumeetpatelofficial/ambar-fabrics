import pino from "pino"

/**
 * Structured JSON logger. Conventions:
 *  - Log an event name plus identifiers (`orderId`, `requestId`), never whole request/response bodies.
 *  - Sensitive fields are redacted below as a safety net; do not rely on it, just do not log them.
 *  - Use `logger.child({ requestId })` per request.
 * Reads LOG_LEVEL directly so this module stays importable from both server and test code.
 */
const level = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info")

export const logger = pino({
  level,
  base: { service: "ambar" },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "password",
      "passwordHash",
      "token",
      "secret",
      "authorization",
      "cookie",
      "email",
      "phone",
      "address",
      "razorpay_signature",
      "*.password",
      "*.passwordHash",
      "*.token",
      "*.secret",
      "*.authorization",
      "*.cookie",
      "*.email",
      "*.phone",
      "*.address",
      "*.razorpay_signature",
      "headers.authorization",
      "headers.cookie",
      "req.headers.authorization",
      "req.headers.cookie",
    ],
    censor: "[redacted]",
  },
})

/** Hide credentials embedded in a connection string before it is logged. */
export function maskConnectionString(text: string): string {
  return text.replace(/(mongodb(?:\+srv)?:\/\/)[^@/\s]*@/gi, "$1[credentials]@")
}
