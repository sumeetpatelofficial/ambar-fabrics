import { Schema } from "mongoose"
import { PAGE_SLUGS } from "@/config/pages"
import { modelFor, type Id } from "./_shared"

/** The shop's wording for an information page, once the owner has edited it. Without one, the built-in draft is used. */
export interface ContentPageDoc {
  _id: Id
  slug: (typeof PAGE_SLUGS)[number]
  title: string
  description?: string
  body: string
  updatedBy?: Id
  updatedAt: Date
}

const schema = new Schema<ContentPageDoc>(
  {
    slug: { type: String, enum: PAGE_SLUGS, required: true, unique: true },
    title: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 320 },
    body: { type: String, required: true, trim: true, minlength: 10, maxlength: 20000 },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
)

export const ContentPage = modelFor<ContentPageDoc>("ContentPage", schema)
