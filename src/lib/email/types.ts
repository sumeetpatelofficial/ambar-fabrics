export type EmailMessage = {
  to: string
  subject: string
  html: string
  text: string
  /** Where a reply should go (set for messages a visitor wrote, so "reply" reaches them). */
  replyTo?: string
  /** Template name, kept for support and for tests. */
  template: string
}

export interface EmailProvider {
  readonly name: string
  send(message: EmailMessage): Promise<void>
}
