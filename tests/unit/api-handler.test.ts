import { beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

vi.mock("next/server", () => ({ connection: async () => {} }))

import { apiHandler } from "@/lib/api/handler"
import { AppError, DatabaseUnavailableError, NotFoundError } from "@/lib/errors"

function call(
  handler: ReturnType<typeof apiHandler>,
  url = "http://localhost/api/x",
  params: Record<string, string> = {},
  headers: Record<string, string> = {}
) {
  const request = { nextUrl: new URL(url), headers: new Headers(headers) }
  return (handler as unknown as (r: unknown, c: unknown) => Promise<Response>)(request, {
    params: Promise.resolve(params),
  })
}

const query = z.object({ n: z.coerce.number().int().min(1) })

describe("apiHandler", () => {
  beforeEach(() => vi.clearAllMocks())

  it("wraps data and meta, and sets cache and request id headers", async () => {
    const h = apiHandler({ cache: "public" }, async () => ({
      data: { ok: true },
      meta: { total: 1 },
    }))
    const res = await call(h, "http://localhost/api/x", {}, { "x-request-id": "req-1" })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { ok: true }, meta: { total: 1 } })
    expect(res.headers.get("x-request-id")).toBe("req-1")
    expect(res.headers.get("cache-control")).toBe("public, s-maxage=60, stale-while-revalidate=300")
  })

  it("is uncacheable by default and generates a request id", async () => {
    const res = await call(apiHandler({}, async () => ({ data: 1 })))
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(res.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/)
  })

  it("returns 422 with field paths for invalid input", async () => {
    const res = await call(
      apiHandler({ query }, async () => ({ data: 1 })),
      "http://localhost/api/x?n=0"
    )
    const body = await res.json()
    expect(res.status).toBe(422)
    expect(body.error).toMatchObject({ code: "VALIDATION_ERROR", details: [{ path: "n" }] })
    expect(body.error.requestId).toBeTruthy()
    expect(res.headers.get("cache-control")).toBe("no-store")
  })

  it("passes validated, typed input to the handler", async () => {
    const seen = vi.fn()
    await call(
      apiHandler({ query }, async ({ query: q }) => (seen(q), { data: 1 })),
      "http://localhost/api/x?n=7"
    )
    expect(seen).toHaveBeenCalledWith({ n: 7 })
  })

  it("answers 404 when the handler returns null, with the configured message", async () => {
    const res = await call(
      apiHandler({ notFoundMessage: "We could not find that product." }, async () => null)
    )
    expect(res.status).toBe(404)
    expect((await res.json()).error).toMatchObject({
      code: "NOT_FOUND",
      message: "We could not find that product.",
    })
  })

  it("answers 404 for an invalid path parameter instead of leaking validation detail", async () => {
    const h = apiHandler(
      { params: z.object({ slug: z.string().regex(/^[a-z]+$/) }) },
      async () => ({ data: 1 })
    )
    expect((await call(h, "http://localhost/api/x", { slug: "../etc" })).status).toBe(404)
  })

  it("maps client errors thrown by services to their status", async () => {
    const res = await call(
      apiHandler({}, async () => {
        throw new NotFoundError("Gone.")
      })
    )
    expect(res.status).toBe(404)
    expect((await res.json()).error.message).toBe("Gone.")
  })

  it("answers 503 with Retry-After for an unavailable dependency, without detail", async () => {
    const res = await call(
      apiHandler({}, async () => {
        throw new DatabaseUnavailableError()
      })
    )
    expect(res.status).toBe(503)
    expect(res.headers.get("retry-after")).toBe("5")
  })

  it("treats driver connectivity errors on an open connection as 503, not 500", async () => {
    for (const name of [
      "MongoServerSelectionError",
      "MongoNetworkError",
      "MongoNetworkTimeoutError",
    ]) {
      const error = Object.assign(new Error("connect ECONNREFUSED mongodb://user:secret@host"), {
        name,
      })
      const res = await call(
        apiHandler({}, async () => {
          throw error
        })
      )
      const text = await res.text()
      expect(res.status, name).toBe(503)
      expect(res.headers.get("retry-after")).toBe("5")
      expect(text).not.toMatch(/ECONNREFUSED|secret/)
      expect(JSON.parse(text).error.code).toBe("DB_UNAVAILABLE")
    }
  })

  it("hides unexpected errors behind a generic 500 that carries the request id", async () => {
    const res = await call(
      apiHandler({}, async () => {
        throw new Error("E11000 duplicate key mongodb://user:secret@host/db")
      }),
      "http://localhost/api/x",
      {},
      { "x-request-id": "req-9" }
    )
    const text = await res.text()
    expect(res.status).toBe(500)
    expect(text).not.toMatch(/E11000|secret|mongodb/)
    expect(JSON.parse(text).error).toMatchObject({ code: "INTERNAL_ERROR", requestId: "req-9" })
  })

  it("treats a non-AppError 5xx-like object as unexpected", async () => {
    const res = await call(
      apiHandler({}, async () => {
        throw new AppError("X", "internal detail", 500)
      })
    )
    expect(res.status).toBe(500)
  })
})
