import { apiHandler } from "@/lib/api/handler"
import { cachedCategoryTree } from "@/services/catalog-cache"

/** GET /api/v1/categories: the category tree (top level with children). */
export const GET = apiHandler({ cache: "public" }, async () => ({
  data: await cachedCategoryTree(),
}))
