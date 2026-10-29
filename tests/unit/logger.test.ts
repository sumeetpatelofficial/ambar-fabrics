import { describe, expect, it } from "vitest"
import { maskConnectionString } from "@/lib/logger"

describe("maskConnectionString", () => {
  it("hides credentials in mongodb URIs", () => {
    expect(maskConnectionString("failed: mongodb+srv://admin:s3cret@cluster0.example.net/db")).toBe(
      "failed: mongodb+srv://[credentials]@cluster0.example.net/db"
    )
  })

  it("leaves text without credentials unchanged", () => {
    expect(maskConnectionString("connect ECONNREFUSED 127.0.0.1:27017")).toBe(
      "connect ECONNREFUSED 127.0.0.1:27017"
    )
  })
})
