import { apiHandler } from "@/lib/api/handler"
import { slugParamSchema } from "@/features/catalog/schemas"
import { cachedRelatedProducts } from "@/services/catalog-cache"

/** GET /api/v1/products/{slug}/related: other products from the same category. */
export const GET = apiHandler(
  { params: slugParamSchema, cache: "public", notFoundMessage: "We could not find that product." },
  async ({ params }) => {
    const items = await cachedRelatedProducts(params.slug)
    return items ? { data: items } : null
  }
)
