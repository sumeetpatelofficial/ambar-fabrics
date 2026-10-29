import { apiHandler } from "@/lib/api/handler"
import { suggestQuerySchema } from "@/features/catalog/schemas"
import { cachedSuggest } from "@/services/catalog-cache"

/** GET /api/v1/products/suggest?q=: search-as-you-type suggestions (products and categories). */
export const GET = apiHandler(
  { query: suggestQuerySchema, cache: "public" },
  async ({ query }) => ({
    data: await cachedSuggest(query.q),
  })
)
