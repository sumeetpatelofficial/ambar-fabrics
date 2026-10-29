import { apiHandler } from "@/lib/api/handler"
import { slugParamSchema } from "@/features/catalog/schemas"
import { cachedCategory } from "@/services/catalog-cache"

/** GET /api/v1/categories/{slug}: category details, breadcrumbs and child categories. */
export const GET = apiHandler(
  { params: slugParamSchema, cache: "public", notFoundMessage: "We could not find that category." },
  async ({ params }) => {
    const category = await cachedCategory(params.slug)
    return category ? { data: category } : null
  }
)
