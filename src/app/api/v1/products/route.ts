import { apiHandler } from "@/lib/api/handler"
import { productListQuerySchema } from "@/features/catalog/schemas"
import { cachedListProducts } from "@/services/catalog-cache"

/** GET /api/v1/products: filter, sort, search and paginate the public catalogue. */
export const GET = apiHandler(
  {
    query: productListQuerySchema,
    cache: "public",
    notFoundMessage: "We could not find that category or collection.",
  },
  async ({ query }) => {
    const result = await cachedListProducts(query)
    if (!result) return null
    const { items, facets, category, collection, ...page } = result
    return {
      data: items,
      meta: {
        ...page,
        facets,
        ...(category ? { category } : {}),
        ...(collection ? { collection } : {}),
      },
    }
  }
)
