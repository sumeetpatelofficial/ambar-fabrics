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

export interface CollectionRule {
  tag?: string
  flag?: "featured" | "bestseller" | "newArrival"
  categoryId?: Id
}

export interface CollectionDoc {
  _id: Id
  name: string
  slug: string
  description?: string
  image?: ImageRef
  /** manual: an explicit list of products. smart: products matching `rule`. */
  type: "manual" | "smart"
  productIds: Id[]
  rule?: CollectionRule
  status: "active" | "hidden"
  /** Optional visibility window, for seasonal collections such as Navratri. */
  startsAt?: Date
  endsAt?: Date
  seo?: Seo
  createdAt: Date
  updatedAt: Date
}

const ruleSchema = new Schema<CollectionRule>(
  {
    tag: { type: String, trim: true, lowercase: true, maxlength: 60 },
    flag: { type: String, enum: ["featured", "bestseller", "newArrival"] },
    categoryId: { type: Schema.Types.ObjectId, ref: "Category" },
  },
  { _id: false }
)

const collectionSchema = new Schema<CollectionDoc>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: slugField,
    description: { type: String, trim: true, maxlength: 5000 },
    image: imageSchema,
    type: { type: String, enum: ["manual", "smart"], default: "manual" },
    productIds: {
      type: [Schema.Types.ObjectId],
      default: [],
      validate: {
        validator: (v: unknown[]) => v.length <= 500,
        message: "a manual collection holds at most 500 products",
      },
    },
    rule: ruleSchema,
    status: { type: String, enum: ["active", "hidden"], default: "active" },
    startsAt: Date,
    endsAt: Date,
    seo: seoSchema,
  },
  { timestamps: true }
)

collectionSchema.index({ status: 1, startsAt: 1, endsAt: 1 })

export const Collection = modelFor<CollectionDoc>("Collection", collectionSchema)
