import { apiHandler } from "@/lib/api/handler"
import { slugParamSchema } from "@/features/catalog/schemas"
import { cachedProductDetail } from "@/services/catalog-cache"

/** GET /api/v1/products/{slug}: one published product with its variants. Never exposes raw stock. */
export const GET = apiHandler(
  { params: slugParamSchema, cache: "public", notFoundMessage: "We could not find that product." },
  async ({ params }) => {
    const product = await cachedProductDetail(params.slug)
    return product ? { data: product } : null
  }
)
