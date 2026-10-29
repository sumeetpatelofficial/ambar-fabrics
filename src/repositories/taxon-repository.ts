import "server-only"
import mongoose from "mongoose"
import { connectDb } from "@/lib/db/mongoose"
import { Taxon, type TaxonDoc, type TaxonKind } from "@/models/taxon"
import type { Id } from "@/models/_shared"

export const taxonRepository = {
  async listActive(kind: TaxonKind): Promise<TaxonDoc[]> {
    await connectDb()
    return Taxon.find({ kind, status: "active" }).sort({ sortOrder: 1, name: 1 }).lean<TaxonDoc[]>()
  },
  async findActiveBySlug(kind: TaxonKind, slug: string): Promise<TaxonDoc | null> {
    await connectDb()
    return Taxon.findOne({ kind, slug, status: "active" }).lean<TaxonDoc>()
  },
  async findByIds(ids: Id[]): Promise<TaxonDoc[]> {
    await connectDb()
    return Taxon.find({ _id: mongoose.trusted({ $in: ids }) }).lean<TaxonDoc[]>()
  },
}
