import { Schema } from "mongoose"
import { modelFor, type Id } from "./_shared"

export interface RedirectDoc {
  _id: Id
  fromPath: string
  toPath: string
  statusCode: 301 | 302 | 308
  hitCount: number
  createdAt: Date
}

const redirectSchema = new Schema<RedirectDoc>(
  {
    fromPath: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: /^\/[^\s?#]*$/,
      maxlength: 300,
    },
    toPath: { type: String, required: true, trim: true, match: /^\/[^\s]*$/, maxlength: 300 },
    statusCode: { type: Number, enum: [301, 302, 308], default: 301 },
    hitCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

redirectSchema.pre("validate", function () {
  if (this.fromPath === this.toPath) this.invalidate("toPath", "a redirect cannot point to itself")
})

// Created when a published slug changes (admin phase) and by the SEO tools (Phase 10).
export const Redirect = modelFor<RedirectDoc>("Redirect", redirectSchema)
