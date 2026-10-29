import mongoose, { Schema, type Model } from "mongoose"
import { SLUG_MAX_LENGTH, SLUG_PATTERN } from "@/lib/slug"

/** Registers a model once. Needed because hot reloads and serverless warm starts re-evaluate modules. */
export function modelFor<T>(name: string, schema: Schema<T>): Model<T> {
  return (mongoose.models[name] as Model<T> | undefined) ?? mongoose.model<T>(name, schema)
}

const safeInt = { validator: Number.isSafeInteger, message: "{PATH} must be an integer" }

/** Integer paise or base-unit quantity, never negative. */
export const intField = (extra: Record<string, unknown> = {}) => ({
  type: Number,
  min: 0,
  validate: safeInt,
  ...extra,
})

export const slugField = {
  type: String,
  required: true,
  unique: true,
  trim: true,
  maxlength: SLUG_MAX_LENGTH,
  match: [SLUG_PATTERN, "slug must be lowercase letters, numbers and single hyphens"] as [
    RegExp,
    string,
  ],
}

export interface Seo {
  title?: string
  description?: string
  canonical?: string
  noindex?: boolean
  ogImage?: string
}

export const seoSchema = new Schema<Seo>(
  {
    title: { type: String, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 320 },
    canonical: { type: String, trim: true, maxlength: 500 },
    noindex: { type: Boolean, default: false },
    ogImage: { type: String, trim: true, maxlength: 500 },
  },
  { _id: false }
)

export interface ImageRef {
  publicId?: string
  url: string
  alt: string
  width?: number
  height?: number
  sortOrder: number
}

export const imageSchema = new Schema<ImageRef>(
  {
    publicId: { type: String, trim: true },
    url: { type: String, required: true, trim: true, maxlength: 500 },
    // Alt text is required: it is both an accessibility and an SEO requirement.
    alt: { type: String, required: true, trim: true, minlength: 1, maxlength: 200 },
    width: intField(),
    height: intField(),
    sortOrder: { type: Number, default: 0 },
  },
  { _id: false }
)

export type Id = mongoose.Types.ObjectId
