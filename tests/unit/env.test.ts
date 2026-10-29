import { describe, expect, it } from "vitest"
import {
  configGroups,
  isGroupConfigured,
  parsePublicEnv,
  parseServerEnv,
  requireGroup,
} from "@/lib/env/schema"
import { ConfigError } from "@/lib/errors"

describe("parsePublicEnv", () => {
  it("defaults the app URL to localhost outside production", () => {
    expect(parsePublicEnv({}, "development").NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000")
  })

  it("requires the app URL in production", () => {
    expect(() => parsePublicEnv({}, "production")).toThrow(ConfigError)
  })

  it("requires https in production", () => {
    expect(() =>
      parsePublicEnv({ NEXT_PUBLIC_APP_URL: "http://shop.example.com" }, "production")
    ).toThrow(/https/)
    expect(
      parsePublicEnv({ NEXT_PUBLIC_APP_URL: "https://shop.example.com/" }, "production")
        .NEXT_PUBLIC_APP_URL
    ).toBe("https://shop.example.com")
  })

  it("allows http for localhost so build-and-start works locally", () => {
    expect(
      parsePublicEnv({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" }, "production")
        .NEXT_PUBLIC_APP_URL
    ).toBe("http://localhost:3000")
  })

  it("treats blank values as unset", () => {
    const env = parsePublicEnv(
      { NEXT_PUBLIC_APP_URL: "https://a.example", NEXT_PUBLIC_GA_MEASUREMENT_ID: "" },
      "production"
    )
    expect(env.NEXT_PUBLIC_GA_MEASUREMENT_ID).toBeUndefined()
  })

  it("rejects malformed analytics and Razorpay ids", () => {
    expect(() => parsePublicEnv({ NEXT_PUBLIC_GA_MEASUREMENT_ID: "UA-1" }, "development")).toThrow(
      ConfigError
    )
    expect(() => parsePublicEnv({ NEXT_PUBLIC_RAZORPAY_KEY_ID: "key_123" }, "development")).toThrow(
      ConfigError
    )
  })
})

describe("parseServerEnv", () => {
  it("accepts an empty environment: integrations are optional until required", () => {
    expect(parseServerEnv({}).NODE_ENV).toBe("development")
  })

  it("rejects a malformed Mongo URI and does not echo the value", () => {
    const bad = "postgres://user:hunter2@host/db"
    try {
      parseServerEnv({ MONGODB_URI: bad })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError)
      expect((error as Error).message).toContain("MONGODB_URI")
      expect((error as Error).message).not.toContain("hunter2")
    }
  })

  it("rejects a short AUTH_SECRET", () => {
    expect(() => parseServerEnv({ AUTH_SECRET: "short" })).toThrow(/AUTH_SECRET/)
  })
})

describe("config groups", () => {
  it("reports missing variables by name only", () => {
    const env = parseServerEnv({ RAZORPAY_KEY_ID: "rzp_test_abc" })
    expect(isGroupConfigured(env, "razorpay")).toBe(false)
    try {
      requireGroup(env, "razorpay")
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError)
      expect((error as ConfigError).missing).toEqual([
        "RAZORPAY_KEY_SECRET",
        "RAZORPAY_WEBHOOK_SECRET",
      ])
      expect((error as Error).message).not.toContain("rzp_test_abc")
    }
  })

  it("returns the values when the whole group is set", () => {
    const env = parseServerEnv({ MONGODB_URI: "mongodb://localhost:27017/x" })
    expect(requireGroup(env, "database")).toEqual({ MONGODB_URI: "mongodb://localhost:27017/x" })
  })

  it("keeps every grouped variable inside the server schema", () => {
    const env = parseServerEnv({})
    for (const keys of Object.values(configGroups)) {
      for (const key of keys) expect(key in env || env[key] === undefined).toBe(true)
    }
  })
})
