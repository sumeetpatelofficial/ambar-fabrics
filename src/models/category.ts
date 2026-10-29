import { Schema } from "mongoose"
import {
  imageSchema,
  modelFor,
  seoSchema,
  slugField,
  type Id,
  type ImageRef,
  type Seo,
} from "./_shared"

export interface CategoryDoc {
  _id: Id
  name: string
  slug: string
  /** One level of nesting in v1 (a category has at most one parent, and a parent has no parent). */
  parentId?: Id | null
  ancestors: Id[]
  description?: string
  image?: ImageRef
  sortOrder: number
  status: "active" | "hidden"
  seo?: Seo
  createdAt: Date
  updatedAt: Date
}

const categorySchema = new Schema<CategoryDoc>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: slugField,
    parentId: { type: Schema.Types.ObjectId, ref: "Category", default: null },
    ancestors: { type: [Schema.Types.ObjectId], default: [] },
    description: { type: String, trim: true, maxlength: 5000 },
    image: imageSchema,
    sortOrder: { type: Number, default: 0 },
    status: { type: String, enum: ["active", "hidden"], default: "active" },
    seo: seoSchema,
  },
  { timestamps: true }
)

categorySchema.index({ parentId: 1, sortOrder: 1 })

export const Category = modelFor<CategoryDoc>("Category", categorySchema)
