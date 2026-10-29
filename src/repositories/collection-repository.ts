import "server-only"
import { connectDb } from "@/lib/db/mongoose"
import { Collection, type CollectionDoc } from "@/models/collection"

export const collectionRepository = {
  /** Active and inside its visibility window (if it has one) at `now`. */
  async findVisibleBySlug(slug: string, now: Date): Promise<CollectionDoc | null> {
    await connectDb()
    const doc = await Collection.findOne({ slug, status: "active" }).lean<CollectionDoc>()
    if (!doc) return null
    if (doc.startsAt && doc.startsAt > now) return null
    if (doc.endsAt && doc.endsAt < now) return null
    return doc
  },
}
