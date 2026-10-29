import { Schema } from "mongoose"
import { intField, modelFor, type Id } from "./_shared"

/** Singleton (key = "default"). Secrets and provider keys are never stored here, only in env vars. */
export interface SiteSettingsDoc {
  _id: Id
  key: "default"
  store: {
    name: string
    legalName?: string
    email?: string
    phone?: string
    addressLines: string[]
    gstin?: string
    stateCode?: string
  }
  tax: { enabled: boolean; mode: "inclusive" | "exclusive"; defaultRatePercent: number }
  shipping: {
    freeThresholdPaise?: number
    flatRatePaise: number
    handlingDays: number
    codEnabled: boolean
  }
  inventory: { reservationMinutes: number; defaultLowStockThreshold: number }
  orders: { numberPattern: string; returnWindowDays: number }
  announcement: { text?: string; href?: string; enabled: boolean }
  seoDefaults: { titleTemplate: string; description?: string; ogImage?: string }
  updatedAt: Date
}

const settingsSchema = new Schema<SiteSettingsDoc>(
  {
    key: { type: String, enum: ["default"], default: "default", unique: true },
    store: {
      name: { type: String, trim: true, maxlength: 80, default: "Ambar" },
      legalName: { type: String, trim: true, maxlength: 120 },
      email: { type: String, trim: true, lowercase: true, maxlength: 120 },
      phone: { type: String, trim: true, maxlength: 20 },
      addressLines: { type: [{ type: String, trim: true, maxlength: 120 }], default: [] },
      gstin: {
        type: String,
        trim: true,
        uppercase: true,
        match: /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/,
      },
      stateCode: { type: String, trim: true, match: /^\d{2}$/ },
      _id: false,
    },
    // Not GST-registered yet, so tax is off. Turning it on later is a settings change, not a code change.
    tax: {
      enabled: { type: Boolean, default: false },
      mode: { type: String, enum: ["inclusive", "exclusive"], default: "inclusive" },
      defaultRatePercent: { type: Number, min: 0, max: 100, default: 5 },
      _id: false,
    },
    shipping: {
      freeThresholdPaise: intField({ default: 150000 }),
      flatRatePaise: intField({ default: 8000 }),
      handlingDays: intField({ default: 2 }),
      codEnabled: { type: Boolean, default: false },
      _id: false,
    },
    inventory: {
      reservationMinutes: intField({ default: 20, min: 5 }),
      defaultLowStockThreshold: intField({ default: 0 }),
      _id: false,
    },
    orders: {
      numberPattern: { type: String, default: "AM-{YY}{MM}-{SEQ6}", maxlength: 60 },
      returnWindowDays: intField({ default: 7 }),
      _id: false,
    },
    announcement: {
      text: { type: String, trim: true, maxlength: 200 },
      href: { type: String, trim: true, maxlength: 300 },
      enabled: { type: Boolean, default: false },
      _id: false,
    },
    seoDefaults: {
      titleTemplate: { type: String, default: "%s | Ambar", maxlength: 120 },
      description: { type: String, trim: true, maxlength: 320 },
      ogImage: { type: String, trim: true, maxlength: 500 },
      _id: false,
    },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
)

export const SiteSettings = modelFor<SiteSettingsDoc>("SiteSettings", settingsSchema)
