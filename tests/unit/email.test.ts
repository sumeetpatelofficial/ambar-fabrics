import { describe, expect, it, vi } from "vitest"
import { escapeHtml } from "@/lib/email/escape"
import { consoleProvider, createResendProvider, linksIn, maskEmail } from "@/lib/email/providers"
import {
  accountExistsMessage,
  googleLinkedMessage,
  passwordChangedMessage,
  passwordResetMessage,
  verifyEmailMessage,
} from "@/lib/email/templates"
import { absoluteUrl } from "@/lib/seo/metadata"

const TOKEN = "T0ken_-abc123XYZ456abc123XYZ456abc123XYZ4"

describe("escapeHtml", () => {
  it("neutralises markup and quotes", () => {
    expect(escapeHtml(`<img src=x onerror="a('b')">&`)).toBe(
      "&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;"
    )
  })
})

describe("email templates", () => {
  const all = () => [
    verifyEmailMessage({ to: "a@example.com", name: "Meera Shah", token: TOKEN }),
    passwordResetMessage({ to: "a@example.com", name: "Meera Shah", token: TOKEN }),
    passwordChangedMessage({ to: "a@example.com", name: "Meera Shah" }),
    accountExistsMessage({ to: "a@example.com", name: "Meera Shah" }),
    googleLinkedMessage({ to: "a@example.com", name: "Meera Shah" }),
  ]

  it("every email has a subject, an HTML body and a plain-text body", () => {
    for (const m of all()) {
      expect(m.subject.length, m.template).toBeGreaterThan(5)
      expect(m.html, m.template).toContain("<!doctype html>")
      expect(m.text.length, m.template).toBeGreaterThan(40)
      expect(m.to).toBe("a@example.com")
    }
  })

  it("verification and reset links carry the one-time token to the right page, in both bodies", () => {
    const verify = verifyEmailMessage({ to: "a@example.com", name: "M", token: TOKEN })
    const reset = passwordResetMessage({ to: "a@example.com", name: "M", token: TOKEN })
    expect(verify.text).toContain(absoluteUrl(`/verify-email?token=${TOKEN}`))
    expect(verify.html).toContain(absoluteUrl(`/verify-email?token=${TOKEN}`))
    expect(reset.text).toContain(absoluteUrl(`/reset-password?token=${TOKEN}`))
    expect(reset.html).toContain(absoluteUrl(`/reset-password?token=${TOKEN}`))
  })

  it("never contains a password, and only the token-bearing emails contain a token", () => {
    for (const m of all()) {
      expect(`${m.html}${m.text}`.toLowerCase()).not.toMatch(
        /your password is|temporary password|password:/
      )
      if (m.template !== "verify_email" && m.template !== "password_reset")
        expect(m.html + m.text).not.toContain(TOKEN)
    }
  })

  it("escapes a hostile name so it cannot inject markup or links", () => {
    const m = verifyEmailMessage({
      to: "a@example.com",
      name: `<script>alert(1)</script>"><a href="https://evil.example">x`,
      token: TOKEN,
    })
    expect(m.html).not.toContain("<script>")
    expect(m.html).not.toContain('href="https://evil.example"')
    expect(m.html).toContain("&lt;script&gt;")
  })

  it("encodes the token in the URL", () => {
    const m = verifyEmailMessage({ to: "a@example.com", name: "M", token: "a b&c=d" })
    expect(m.text).toContain("token=a%20b%26c%3Dd")
  })

  it("addresses the customer by first name and handles an empty name", () => {
    expect(
      verifyEmailMessage({ to: "a@example.com", name: "Meera Shah", token: TOKEN }).text
    ).toContain("Hello Meera,")
    expect(verifyEmailMessage({ to: "a@example.com", name: "  ", token: TOKEN }).text).toContain(
      "Hello there,"
    )
  })
})

describe("email providers", () => {
  const message = verifyEmailMessage({ to: "meera@example.com", name: "Meera", token: TOKEN })

  it("sends to Resend with a bearer token and the full message, with a timeout", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }))
    await createResendProvider(
      "re_test_key",
      "Ambar <hello@example.com>",
      fetchMock as unknown as typeof fetch
    ).send(message)
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe("https://api.resend.com/emails")
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_test_key")
    expect(JSON.parse(init.body as string)).toEqual({
      from: "Ambar <hello@example.com>",
      to: ["meera@example.com"],
      subject: message.subject,
      html: message.html,
      text: message.text,
    })
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it("reports only the status code when sending fails, never the provider's body or the recipient", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ message: "Invalid to: meera@example.com" }), { status: 422 })
      )
    const send = createResendProvider(
      "k",
      "f@example.com",
      fetchMock as unknown as typeof fetch
    ).send(message)
    await expect(send).rejects.toThrow("Resend responded 422")
    await expect(send).rejects.not.toThrow(/meera/)
  })

  it("propagates network errors so the job is retried", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"))
    await expect(
      createResendProvider("k", "f@example.com", fetchMock as unknown as typeof fetch).send(message)
    ).rejects.toThrow("fetch failed")
  })

  it("masks addresses in logs, and the console provider never logs the body", async () => {
    expect(maskEmail("meera.shah@example.com")).toBe("me***@example.com")
    await expect(consoleProvider.send(message)).resolves.toBeUndefined()
  })
})

describe("development email output", () => {
  it("finds the links in a message body", () => {
    const m = verifyEmailMessage({ to: "a@example.com", name: "Meera", token: TOKEN })
    expect(linksIn(m.text)).toEqual([absoluteUrl(`/verify-email?token=${TOKEN}`)])
    expect(linksIn("no links here")).toEqual([])
  })
})
