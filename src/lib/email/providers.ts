import "server-only"
import { ConfigError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { getServerEnv, isGroupConfigured, requireGroup } from "@/lib/env/server"
import type { EmailMessage, EmailProvider } from "@/lib/email/types"

/** Every URL in an email body: the one-time links a developer needs in order to finish a sign-up locally. */
export function linksIn(text: string): string[] {
  return [...text.matchAll(/https?:\/\/[^\s"<>]+/g)].map((m) => m[0])
}

/**
 * Development: prints the email's links to the terminal, because no email is actually sent. Links are
 * printed only when NODE_ENV is "development". Anywhere else (tests, the browser-test server) only a
 * one-line notice is logged, so one-time links never end up in shared logs.
 */
export const consoleProvider: EmailProvider = {
  name: "console",
  async send(message) {
    const showLinks = process.env.NODE_ENV === "development"
    logger.info(
      {
        event: "email.console",
        template: message.template,
        ...(showLinks ? { links: linksIn(message.text) } : {}),
      },
      `Email to ${maskEmail(message.to)}: ${message.subject}`
    )
  },
}

export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@")
  return `${local.slice(0, 2)}***@${domain}`
}

/** Resend over its REST API (no SDK). The account and a verified sending domain are set up in Phase 14. */
export function createResendProvider(
  apiKey: string,
  from: string,
  fetchImpl: typeof fetch = fetch
): EmailProvider {
  return {
    name: "resend",
    async send(message: EmailMessage) {
      const response = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
          ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        }),
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) {
        // The provider's error text can echo the recipient; keep only the status code.
        throw new Error(`Resend responded ${response.status}`)
      }
    },
  }
}

/**
 * Picks the provider from configuration. Production must have a real one: it refuses to fall back to
 * printing, because a customer would simply never receive their email.
 */
export function getEmailProvider(): EmailProvider {
  const env = getServerEnv()
  if (isGroupConfigured("email")) {
    const { RESEND_API_KEY, EMAIL_FROM } = requireGroup("email")
    return createResendProvider(RESEND_API_KEY, EMAIL_FROM)
  }
  if (env.NODE_ENV === "production" && process.env.ENABLE_DEV_PAGES !== "1") {
    throw new ConfigError("Email is not configured: set RESEND_API_KEY and EMAIL_FROM.", [
      "RESEND_API_KEY",
      "EMAIL_FROM",
    ])
  }
  return consoleProvider
}
