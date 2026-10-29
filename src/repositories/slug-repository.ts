import "server-only"
import mongoose from "mongoose"
import { connectDb } from "@/lib/db/mongoose"
import type { CatalogKind } from "@/lib/slug-guard"
import { isValidSlug } from "@/lib/slug"
import { Category } from "@/models/category"
import { Collection } from "@/models/collection"
import { Product } from "@/models/product"
import { Taxon } from "@/models/taxon"

/** Existence checks for public URLs. Mirrors what the catalogue service treats as visible. */
export const slugRepository = {
  /**
   * Where a category lives: `null` for a top-level category, its parent's slug for a sub-category,
   * `undefined` when there is no such visible category.
   */
  async categoryParent(slug: string): Promise<string | null | undefined> {
    if (!isValidSlug(slug)) return undefined
    await connectDb()
    const category = await Category.findOne({ slug, status: "active" })
      .select({ parentId: 1 })
      .lean<{ parentId?: mongoose.Types.ObjectId | null }>()
    if (!category) return undefined
    if (!category.parentId) return null
    const parent = await Category.findOne({ _id: category.parentId, status: "active" })
      .select({ slug: 1 })
      .lean<{ slug: string }>()
    // A sub-category whose parent is hidden is still reachable, on its own address.
    return parent?.slug ?? null
  },

  async exists(kind: CatalogKind, slug: string, now = new Date()): Promise<boolean> {
    if (!isValidSlug(slug)) return false // never reaches the database
    await connectDb()
    switch (kind) {
      case "product":
        return Boolean(
          await Product.exists({
            slug,
            status: "active",
            variantCount: mongoose.trusted({ $gte: 1 }),
          })
        )
      case "category":
        return Boolean(await Category.exists({ slug, status: "active" }))
      case "fabric":
      case "print":
        return Boolean(await Taxon.exists({ kind, slug, status: "active" }))
      case "collection": {
        const doc = await Collection.findOne({ slug, status: "active" })
          .select({ startsAt: 1, endsAt: 1 })
          .lean<{ startsAt?: Date; endsAt?: Date }>()
        if (!doc) return false
        return !(doc.startsAt && doc.startsAt > now) && !(doc.endsAt && doc.endsAt < now)
      }
    }
  },
}
