import "server-only"
import { connection, type NextRequest } from "next/server"
import { ZodError, type z } from "zod"
import { AppError, DatabaseUnavailableError, isDatabaseUnavailable } from "@/lib/errors"
import { logger, maskConnectionString } from "@/lib/logger"
import { searchParamsToObject } from "@/features/catalog/schemas"

/**
 * Wrapper for public Route Handlers: request id, input validation, one error format, cache headers.
 * Contract: docs/api-contracts.md. Success is `{ data, meta? }`; failure is `{ error: { code, message,
 * details?, requestId } }`. Unexpected errors never leak detail; they are logged with the request id.
 */
type RouteCtx = { params: Promise<Record<string, string | string[] | undefined>> }

export type ApiResult<T> = { data: T; meta?: Record<string, unknown> } | null

const CACHE_HEADERS = {
  public: "public, s-maxage=60, stale-while-revalidate=300",
  none: "no-store",
} as const

export function apiHandler<
  Q extends z.ZodType = z.ZodUndefined,
  P extends z.ZodType = z.ZodUndefined,
  T = unknown,
>(
  options: {
    query?: Q
    params?: P
    cache?: keyof typeof CACHE_HEADERS
    notFoundMessage?: string
  },
  handler: (input: {
    query: z.infer<Q>
    params: z.infer<P>
    requestId: string
  }) => Promise<ApiResult<T>>
) {
  return async function route(request: NextRequest, ctx: RouteCtx): Promise<Response> {
    // Reads the database at request time, so it must never be prerendered during `next build`.
    await connection()
    const requestId = request.headers.get("x-request-id")?.slice(0, 64) || crypto.randomUUID()
    const base = { "X-Request-Id": requestId }

    const fail = (
      status: number,
      code: string,
      message: string,
      details?: unknown,
      extra: Record<string, string> = {}
    ) =>
      Response.json(
        { error: { code, message, ...(details ? { details } : {}), requestId } },
        { status, headers: { ...base, "Cache-Control": "no-store", ...extra } }
      )

    try {
      const query = options.query
        ? options.query.safeParse(searchParamsToObject(request.nextUrl.searchParams))
        : undefined
      if (query && !query.success)
        return fail(
          422,
          "VALIDATION_ERROR",
          "Some of the information is not valid.",
          issues(query.error)
        )

      const params = options.params ? options.params.safeParse(await ctx.params) : undefined
      if (params && !params.success)
        return fail(404, "NOT_FOUND", options.notFoundMessage ?? "We could not find that.")

      const result = await handler({
        query: query?.data as z.infer<Q>,
        params: params?.data as z.infer<P>,
        requestId,
      })
      if (result === null)
        return fail(404, "NOT_FOUND", options.notFoundMessage ?? "We could not find that.")

      return Response.json(
        { data: result.data, ...(result.meta ? { meta: result.meta } : {}) },
        { headers: { ...base, "Cache-Control": CACHE_HEADERS[options.cache ?? "none"] } }
      )
    } catch (error) {
      if (error instanceof ZodError)
        return fail(422, "VALIDATION_ERROR", "Some of the information is not valid.", issues(error))
      if (error instanceof AppError && error.status < 500)
        return fail(error.status, error.code, error.message, error.details)
      logger.error(
        {
          event: "api.unhandled_error",
          requestId,
          path: request.nextUrl.pathname,
          errorName: error instanceof Error ? error.name : "UnknownError",
          errorMessage: maskConnectionString(
            error instanceof Error ? error.message : String(error)
          ),
        },
        "Unhandled API error"
      )
      if (isDatabaseUnavailable(error)) {
        // Covers failures on an already-open connection as well as failed connects.
        const unavailable = new DatabaseUnavailableError()
        return fail(unavailable.status, unavailable.code, unavailable.message, undefined, {
          "Retry-After": "5",
        })
      }
      if (error instanceof AppError)
        return fail(error.status, error.code, error.message, undefined, { "Retry-After": "5" })
      return fail(500, "INTERNAL_ERROR", "Something went wrong on our side. Please try again.")
    }
  }
}

function issues(error: ZodError) {
  return error.issues.map((i) => ({ path: i.path.join("."), issue: i.message }))
}
