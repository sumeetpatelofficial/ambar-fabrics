import "server-only"
import mongoose from "mongoose"
import { connectDb } from "@/lib/db/mongoose"
import { ProductVariant, type ProductVariantDoc } from "@/models/product-variant"
import type { Id } from "@/models/_shared"

export const variantRepository = {
  async findActiveByProductId(productId: Id): Promise<ProductVariantDoc[]> {
    await connectDb()
    return ProductVariant.find({ productId, status: "active" })
      .sort({ sortOrder: 1, sku: 1 })
      .lean<ProductVariantDoc[]>()
  },

  async findByProductId(productId: Id): Promise<ProductVariantDoc[]> {
    await connectDb()
    return ProductVariant.find({ productId })
      .sort({ sortOrder: 1, sku: 1 })
      .lean<ProductVariantDoc[]>()
  },

  /** Exact SKU match (SKUs are stored upper-case). Returns the owning product ids. */
  async productIdsBySku(sku: string): Promise<Id[]> {
    await connectDb()
    const rows = await ProductVariant.find({ sku: sku.toUpperCase(), status: "active" })
      .select({ productId: 1 })
      .lean<Pick<ProductVariantDoc, "productId">[]>()
    return rows.map((r) => r.productId)
  },

  async findActiveByProductIds(productIds: Id[]): Promise<ProductVariantDoc[]> {
    await connectDb()
    return ProductVariant.find({
      productId: mongoose.trusted({ $in: productIds }),
      status: "active",
    }).lean<ProductVariantDoc[]>()
  },

  async findActiveByIds(ids: Id[]): Promise<ProductVariantDoc[]> {
    await connectDb()
    return ProductVariant.find({ _id: mongoose.trusted({ $in: ids }), status: "active" }).lean<
      ProductVariantDoc[]
    >()
  },
}
