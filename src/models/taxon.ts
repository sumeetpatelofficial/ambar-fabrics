import { Schema } from "mongoose"
import { imageSchema, modelFor, slugField, type Id, type ImageRef } from "./_shared"

import { TAXON_KINDS, type TaxonKind } from "@/config/taxa"

export { TAXON_KINDS }
export type { TaxonKind }

/**
 * A master list entry used by products in any category: a fabric (cotton, crepe, gaji silk, modal silk, chinon,
 * tissue) or a print (bandhani, ajrakh, block print). One cotton entry serves cotton cloth, cotton dupattas,
 * blouses and suits alike, so "all cotton" and "all ajrakh" are one click, whatever the product is.
 */
export interface TaxonDoc {
  _id: Id
  kind: TaxonKind
  name: string
  /** Unique within its kind (there can be a fabric "ajrakh" and a print "ajrakh"). */
  slug: string
  description?: string
  image?: ImageRef
  sortOrder: number
  status: "active" | "hidden"
  createdAt: Date
  updatedAt: Date
}

const schema = new Schema<TaxonDoc>(
  {
    kind: { type: String, enum: TAXON_KINDS, required: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    slug: { ...slugField, unique: false },
    description: { type: String, trim: true, maxlength: 2000 },
    image: imageSchema,
    sortOrder: { type: Number, default: 0 },
    status: { type: String, enum: ["active", "hidden"], default: "active" },
  },
  { timestamps: true }
)
schema.index({ kind: 1, slug: 1 }, { unique: true })
schema.index({ kind: 1, name: 1 }, { unique: true, collation: { locale: "en", strength: 2 } })
schema.index({ kind: 1, status: 1, sortOrder: 1 })

export const Taxon = modelFor<TaxonDoc>("Taxon", schema)
