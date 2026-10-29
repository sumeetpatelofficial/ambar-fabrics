import { siteDefaults } from "@/config/site"
import { escapeHtml } from "@/lib/email/escape"
import type { EmailMessage } from "@/lib/email/types"
import { absoluteUrl } from "@/lib/seo/metadata"

/**
 * Transactional emails. Plain, responsive and consistent with the store. Rules: no password or secret is
 * ever sent; links carry a one-time token only; every dynamic value is escaped; each email also has a
 * plain-text body so it works without HTML.
 */

function layout(opts: {
  preheader: string
  heading: string
  paragraphs: string[]
  button?: { label: string; url: string }
  footnote?: string
}): string {
  const p = opts.paragraphs
    .map((t) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:#23211d">${t}</p>`)
    .join("")
  const button = opts.button
    ? `<p style="margin:24px 0"><a href="${escapeHtml(opts.button.url)}" style="display:inline-block;background:#06332e;color:#fbf9f4;text-decoration:none;padding:14px 24px;font-size:16px;border-radius:4px">${escapeHtml(opts.button.label)}</a></p><p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:#66615a">If the button does not work, copy this address into your browser:<br><span style="word-break:break-all">${escapeHtml(opts.button.url)}</span></p>`
    : ""
  const foot = opts.footnote
    ? `<p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#66615a">${opts.footnote}</p>`
    : ""
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(opts.heading)}</title></head><body style="margin:0;background:#fbf9f4;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif"><span style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(opts.preheader)}</span><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbf9f4"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px"><tr><td style="padding-bottom:24px;font-family:Georgia,'Times New Roman',serif;font-size:26px;color:#23211d">${escapeHtml(siteDefaults.name)}</td></tr><tr><td style="background:#fefdfa;border:1px solid #e2dccd;padding:32px"><h1 style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:26px;line-height:1.2;color:#23211d">${escapeHtml(opts.heading)}</h1>${p}${button}${foot}</td></tr></table></td></tr></table></body></html>`
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || "there"

export function verifyEmailMessage(input: {
  to: string
  name: string
  token: string
}): EmailMessage {
  const url = absoluteUrl(`/verify-email?token=${encodeURIComponent(input.token)}`)
  const hello = firstName(input.name)
  return {
    to: input.to,
    template: "verify_email",
    subject: `Confirm your email for ${siteDefaults.name}`,
    html: layout({
      preheader: "Confirm your email address to finish creating your account.",
      heading: "Confirm your email",
      paragraphs: [
        `Hello ${escapeHtml(hello)},`,
        "Please confirm your email address to finish creating your account. The link works for 24 hours.",
      ],
      button: { label: "Confirm email", url },
      footnote:
        "If you did not create an account, you can ignore this email and nothing will happen.",
    }),
    text: `Hello ${hello},\n\nConfirm your email address to finish creating your ${siteDefaults.name} account. The link works for 24 hours:\n\n${url}\n\nIf you did not create an account, ignore this email.`,
  }
}

export function passwordResetMessage(input: {
  to: string
  name: string
  token: string
}): EmailMessage {
  const url = absoluteUrl(`/reset-password?token=${encodeURIComponent(input.token)}`)
  const hello = firstName(input.name)
  return {
    to: input.to,
    template: "password_reset",
    subject: `Reset your ${siteDefaults.name} password`,
    html: layout({
      preheader: "Use this link to choose a new password.",
      heading: "Choose a new password",
      paragraphs: [
        `Hello ${escapeHtml(hello)},`,
        "We received a request to reset your password. The link works for one hour and can be used once.",
      ],
      button: { label: "Reset password", url },
      footnote: "If you did not ask for this, ignore this email. Your password has not changed.",
    }),
    text: `Hello ${hello},\n\nWe received a request to reset your ${siteDefaults.name} password. The link works for one hour and can be used once:\n\n${url}\n\nIf you did not ask for this, ignore this email. Your password has not changed.`,
  }
}

export function passwordChangedMessage(input: { to: string; name: string }): EmailMessage {
  const url = absoluteUrl("/forgot-password")
  const hello = firstName(input.name)
  return {
    to: input.to,
    template: "password_changed",
    subject: `Your ${siteDefaults.name} password was changed`,
    html: layout({
      preheader: "Your password was just changed.",
      heading: "Your password was changed",
      paragraphs: [
        `Hello ${escapeHtml(hello)},`,
        "The password on your account was just changed, and you were signed out on other devices.",
      ],
      button: { label: "I did not do this", url },
      footnote:
        "If this was you, no action is needed. If it was not, use the button to reset your password straight away.",
    }),
    text: `Hello ${hello},\n\nThe password on your ${siteDefaults.name} account was just changed, and you were signed out on other devices.\n\nIf this was not you, reset your password now: ${url}`,
  }
}

export function accountExistsMessage(input: { to: string; name: string }): EmailMessage {
  const signIn = absoluteUrl("/login")
  const reset = absoluteUrl("/forgot-password")
  const hello = firstName(input.name)
  return {
    to: input.to,
    template: "account_exists",
    subject: `You already have a ${siteDefaults.name} account`,
    html: layout({
      preheader: "Someone tried to create an account with this email address.",
      heading: "You already have an account",
      paragraphs: [
        `Hello ${escapeHtml(hello)},`,
        "Someone tried to create an account with this email address, but one already exists. If that was you, sign in instead.",
      ],
      button: { label: "Sign in", url: signIn },
      footnote: `Forgotten your password? You can <a href="${escapeHtml(reset)}" style="color:#06332e">reset it here</a>. If it was not you, no action is needed.`,
    }),
    text: `Hello ${hello},\n\nSomeone tried to create a ${siteDefaults.name} account with this email address, but one already exists. Sign in: ${signIn}\n\nForgotten your password? Reset it: ${reset}\n\nIf it was not you, no action is needed.`,
  }
}

export function googleLinkedMessage(input: { to: string; name: string }): EmailMessage {
  const url = absoluteUrl("/forgot-password")
  const hello = firstName(input.name)
  return {
    to: input.to,
    template: "google_linked",
    subject: `Google sign-in was added to your ${siteDefaults.name} account`,
    html: layout({
      preheader: "A Google account was linked to your account.",
      heading: "Google sign-in added",
      paragraphs: [
        `Hello ${escapeHtml(hello)},`,
        "You can now sign in to your account with Google as well as your password.",
      ],
      footnote: `If you did not do this, <a href="${escapeHtml(url)}" style="color:#06332e">reset your password</a> straight away.`,
    }),
    text: `Hello ${hello},\n\nYou can now sign in to your ${siteDefaults.name} account with Google as well as your password.\n\nIf you did not do this, reset your password now: ${url}`,
  }
}

export type OrderEmailInput = {
  to: string
  name: string
  orderNumber: string
  lines: { name: string; quantity: string; amount: string }[]
  shipping: string
  discount?: string
  total: string
  address: string
}

/** Sent once when payment is confirmed. Everything dynamic is escaped; amounts arrive already formatted. */
export function orderConfirmedMessage(input: OrderEmailInput): EmailMessage {
  const url = absoluteUrl(`/account/orders/${encodeURIComponent(input.orderNumber)}`)
  const rows = input.lines
    .map(
      (l) =>
        `<tr><td style="padding:6px 0;font-size:15px;color:#23211d">${escapeHtml(l.name)}<br><span style="color:#66615a;font-size:13px">${escapeHtml(l.quantity)}</span></td><td align="right" style="padding:6px 0;font-size:15px;color:#23211d;white-space:nowrap">${escapeHtml(l.amount)}</td></tr>`
    )
    .join("")
  const summary = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border-top:1px solid #e2dccd;border-bottom:1px solid #e2dccd">${rows}${
    input.discount
      ? `<tr><td style="padding:6px 0;font-size:15px">Discount</td><td align="right">-${escapeHtml(input.discount)}</td></tr>`
      : ""
  }<tr><td style="padding:6px 0;font-size:15px">Shipping</td><td align="right" style="font-size:15px">${escapeHtml(input.shipping)}</td></tr><tr><td style="padding:6px 0;font-size:16px"><strong>Total</strong></td><td align="right" style="font-size:16px"><strong>${escapeHtml(input.total)}</strong></td></tr></table>`
  const hello = firstName(input.name)
  return {
    to: input.to,
    template: "order_confirmed",
    subject: `Order ${input.orderNumber} confirmed`,
    html: layout({
      preheader: `We have your order ${input.orderNumber}.`,
      heading: "Thank you for your order",
      paragraphs: [
        `Hello ${escapeHtml(hello)}, your payment is confirmed. Your order number is <strong>${escapeHtml(input.orderNumber)}</strong>.`,
        summary,
        `Delivering to: ${escapeHtml(input.address)}`,
        "Fabric is cut to the length you chose, so cut pieces cannot be returned.",
      ],
      button: { label: "View your order", url },
    }),
    text: `Hello ${hello},\n\nYour payment is confirmed. Order ${input.orderNumber}.\n\n${input.lines
      .map((l) => `${l.name} (${l.quantity}): ${l.amount}`)
      .join(
        "\n"
      )}\n${input.discount ? `Discount: -${input.discount}\n` : ""}Shipping: ${input.shipping}\nTotal: ${input.total}\n\nDelivering to: ${input.address}\n\nView your order: ${url}\n\nFabric is cut to the length you chose, so cut pieces cannot be returned.`,
  }
}

export function orderShippedMessage(input: {
  to: string
  name: string
  orderNumber: string
  courier: string
  awb: string
  trackingUrl?: string
}): EmailMessage {
  const url = absoluteUrl(`/account/orders/${encodeURIComponent(input.orderNumber)}`)
  const hello = firstName(input.name)
  return {
    to: input.to,
    template: "order_shipped",
    subject: `Order ${input.orderNumber} is on its way`,
    html: layout({
      preheader: `Your order ${input.orderNumber} has been picked up by ${input.courier}.`,
      heading: "Your order is on its way",
      paragraphs: [
        `Hello ${escapeHtml(hello)}, order <strong>${escapeHtml(input.orderNumber)}</strong> has been picked up by ${escapeHtml(input.courier)}.`,
        `Tracking number: <strong>${escapeHtml(input.awb)}</strong>`,
      ],
      button: { label: "Track your order", url },
    }),
    text: `Hello ${hello},\n\nOrder ${input.orderNumber} has been picked up by ${input.courier}.\nTracking number: ${input.awb}\n${input.trackingUrl ? `Courier tracking: ${input.trackingUrl}\n` : ""}\nTrack your order: ${url}`,
  }
}

export function orderDeliveredMessage(input: {
  to: string
  name: string
  orderNumber: string
  returnWindowDays: number
}): EmailMessage {
  const url = absoluteUrl(`/account/orders/${encodeURIComponent(input.orderNumber)}`)
  const hello = firstName(input.name)
  return {
    to: input.to,
    template: "order_delivered",
    subject: `Order ${input.orderNumber} was delivered`,
    html: layout({
      preheader: `Your order ${input.orderNumber} has been delivered.`,
      heading: "Delivered",
      paragraphs: [
        `Hello ${escapeHtml(hello)}, order <strong>${escapeHtml(input.orderNumber)}</strong> has been delivered. We hope you love it.`,
        `Ready-made items can be returned within ${input.returnWindowDays} days of delivery. Fabric cut to your length cannot be returned.`,
      ],
      button: { label: "View your order", url },
    }),
    text: `Hello ${hello},\n\nOrder ${input.orderNumber} has been delivered.\nReady-made items can be returned within ${input.returnWindowDays} days of delivery. Fabric cut to your length cannot be returned.\n\n${url}`,
  }
}

export function orderCancelledMessage(input: {
  to: string
  name: string
  orderNumber: string
  refund: string
}): EmailMessage {
  const url = absoluteUrl(`/account/orders/${encodeURIComponent(input.orderNumber)}`)
  const hello = firstName(input.name)
  return {
    to: input.to,
    template: "order_cancelled",
    subject: `Order ${input.orderNumber} was cancelled`,
    html: layout({
      preheader: `Order ${input.orderNumber} is cancelled and ${input.refund} is being refunded.`,
      heading: "Your order was cancelled",
      paragraphs: [
        `Hello ${escapeHtml(hello)}, order <strong>${escapeHtml(input.orderNumber)}</strong> has been cancelled.`,
        `${escapeHtml(input.refund)} is being refunded to your original payment method. Banks usually take 5 to 7 working days.`,
      ],
      button: { label: "View your order", url },
    }),
    text: `Hello ${hello},\n\nOrder ${input.orderNumber} has been cancelled. ${input.refund} is being refunded to your original payment method (usually 5 to 7 working days).\n\n${url}`,
  }
}

/** A message a visitor wrote on the contact page, sent to the shop. Everything the visitor typed is escaped. */
export function contactMessageEmail(input: {
  to: string
  name: string
  email: string
  message: string
}): EmailMessage {
  const body = escapeHtml(input.message).replace(/\n/g, "<br>")
  return {
    to: input.to,
    replyTo: input.email,
    template: "contact_message",
    subject: `Message from ${input.name.replace(/[\r\n]+/g, " ").slice(0, 60)}`,
    html: layout({
      preheader: "A message from the contact page.",
      heading: "New message",
      paragraphs: [
        `<strong>${escapeHtml(input.name)}</strong> (${escapeHtml(input.email)}) wrote:`,
        body,
      ],
    }),
    text: `${input.name} (${input.email}) wrote:\n\n${input.message}`,
  }
}
