import { apiHandler } from "@/lib/api/handler"
import { cachedPublicSettings } from "@/services/catalog-cache"

/** GET /api/v1/settings/public: store name, announcement and other values safe to show anyone. */
export const GET = apiHandler({ cache: "public" }, async () => ({
  data: await cachedPublicSettings(),
}))
