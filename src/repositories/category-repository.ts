import "server-only"
import mongoose from "mongoose"
import { connectDb } from "@/lib/db/mongoose"
import { Category, type CategoryDoc } from "@/models/category"
import type { Id } from "@/models/_shared"

export const categoryRepository = {
  async listActive(): Promise<CategoryDoc[]> {
    await connectDb()
    return Category.find({ status: "active" }).sort({ sortOrder: 1, name: 1 }).lean<CategoryDoc[]>()
  },

  async findActiveBySlug(slug: string): Promise<CategoryDoc | null> {
    await connectDb()
    return Category.findOne({ slug, status: "active" }).lean<CategoryDoc>()
  },

  async findByIds(ids: Id[]): Promise<CategoryDoc[]> {
    await connectDb()
    return Category.find({ _id: mongoose.trusted({ $in: ids }) }).lean<CategoryDoc[]>()
  },

  async suggest(pattern: string, limit: number): Promise<CategoryDoc[]> {
    await connectDb()
    return Category.find({ status: "active", name: new RegExp(`(^|\\s)${pattern}`, "i") })
      .sort({ sortOrder: 1, name: 1 })
      .limit(limit)
      .lean<CategoryDoc[]>()
  },
}
