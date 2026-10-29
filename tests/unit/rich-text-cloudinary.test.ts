import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import { createUploadTicket, signUploadParams } from "@/lib/cloudinary"
import { parseInline, parseRichText } from "@/lib/rich-text"

describe("information page markup", () => {
  it("makes paragraphs, headings and lists", () => {
    const blocks = parseRichText(
      "Hello there.\nStill the same paragraph.\n\n## A heading\n\n- one\n- two\n\nLast."
    )
    expect(blocks).toEqual([
      { type: "paragraph", content: [{ text: "Hello there. Still the same paragraph." }] },
      { type: "heading", text: "A heading" },
      { type: "list", items: [[{ text: "one" }], [{ text: "two" }]] },
      { type: "paragraph", content: [{ text: "Last." }] },
    ])
  })

  it("links to this site and to https sites only", () => {
    expect(
      parseInline("See [shipping](/shipping-policy) and [Razorpay](https://razorpay.com) now")
    ).toEqual([
      { text: "See " },
      { link: "shipping", href: "/shipping-policy", external: false },
      { text: " and " },
      { link: "Razorpay", href: "https://razorpay.com", external: true },
      { text: " now" },
    ])
  })

  it("never turns anything else into a link or into HTML", () => {
    for (const bad of [
      "[x](javascript:alert(1))",
      "[x](http://plain.example)",
      "[x](//evil.example)",
      "[x](data:text/html;base64,AAAA)",
    ]) {
      expect(
        parseInline(bad).every((p) => "text" in p),
        bad
      ).toBe(true)
    }
    const html = parseRichText("<script>alert(1)</script> and <b>bold</b>")
    expect(html).toEqual([
      { type: "paragraph", content: [{ text: "<script>alert(1)</script> and <b>bold</b>" }] },
    ]) // shown as text by React
  })

  it("copes with empty input and windows line endings", () => {
    expect(parseRichText("")).toEqual([])
    expect(parseRichText("a\r\n\r\nb")).toHaveLength(2)
  })
})

describe("Cloudinary signing", () => {
  it("signs sorted name=value pairs joined by & with the secret appended", () => {
    const expected = createHash("sha1")
      .update("allowed_formats=jpg&folder=ambar/products&timestamp=1700000000secret")
      .digest("hex")
    expect(
      signUploadParams(
        { timestamp: 1700000000, folder: "ambar/products", allowed_formats: "jpg" },
        "secret"
      )
    ).toBe(expected)
  })
  it("the ticket carries the public key but never the secret, and signs what the browser must send", () => {
    const ticket = createUploadTicket(
      { cloudName: "demo", apiKey: "123", apiSecret: "top-secret" },
      1_700_000_000_000
    )
    expect(JSON.stringify(ticket)).not.toContain("top-secret")
    expect(ticket).toMatchObject({
      cloudName: "demo",
      apiKey: "123",
      timestamp: 1_700_000_000,
      folder: "ambar/products",
    })
    expect(ticket.signature).toBe(
      signUploadParams(
        {
          allowed_formats: ticket.allowedFormats,
          folder: ticket.folder,
          timestamp: ticket.timestamp,
        },
        "top-secret"
      )
    )
    expect(ticket.signature).toMatch(/^[0-9a-f]{40}$/)
  })
})
