import { apiHandler } from "@/lib/api/handler"
import { slugParamSchema } from "@/features/catalog/schemas"
import { cachedCollection } from "@/services/catalog-cache"

/** GET /api/v1/collections/{slug}: a collection that is active and inside its visibility window. */
export const GET = apiHandler(
  {
    params: slugParamSchema,
    cache: "public",
    notFoundMessage: "We could not find that collection.",
  },
  async ({ params }) => {
    const collection = await cachedCollection(params.slug)
    return collection ? { data: collection } : null
  }
)
