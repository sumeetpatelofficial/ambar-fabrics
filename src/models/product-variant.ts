import { Schema } from "mongoose"
import { intField, modelFor, type Id } from "./_shared"
import { sellingUnitSchema, type SellingUnit } from "@/lib/measure"

export interface ProductVariantDoc {
  _id: Id
  productId: Id
  sku: string
  status: "active" | "inactive"
  /** Display order within the product (swatches, selector). Ties fall back to SKU. */
  sortOrder: number
  options: { colorName?: string; colorHex?: string; pattern?: string; size?: string }
  sellingUnit: SellingUnit
  /** Per `sellingUnit.pricePerBaseUnits`, i.e. per metre for fabric. Integer paise. */
  pricePaise: number
  /** What the shop paid, per the same unit as `pricePaise` (per metre for fabric). Private: never sent to the shop or to staff without `costs:read`. */
  costPaise?: number
  /** MRP shown struck through. Only meaningful when higher than the selling price. */
  compareAtPaise?: number
  salePricePaise?: number
  saleStartsAt?: Date
  saleEndsAt?: Date
  /** In the unit's base unit (millimetres for fabric by length). `available = onHand - reserved`. */
  stock: { onHand: number; reserved: number }
  lowStockThreshold: number
  imageUrl?: string
  weightGrams?: number
  barcode?: string
  createdAt: Date
  updatedAt: Date
}

const unitField = (extra: Record<string, unknown> = {}) => ({
  type: Number,
  required: true,
  min: 1,
  validate: { validator: Number.isSafeInteger, message: "{PATH} must be an integer" },
  ...extra,
})

const sellingUnitMongoSchema = new Schema<SellingUnit>(
  {
    kind: { type: String, required: true, enum: ["length", "piece", "set", "pair", "pack"] },
    baseUnit: { type: String, required: true, enum: ["mm", "each"] },
    displayUnit: { type: String, required: true, enum: ["m", "cm", "each", "set", "pair", "pack"] },
    baseUnitsPerDisplayUnit: unitField(),
    pricePerBaseUnits: unitField(),
    minQty: unitField(),
    stepQty: unitField(),
    maxQtyPerOrder: intField({ min: 1 }),
  },
  { _id: false }
)

const variantSchema = new Schema<ProductVariantDoc>(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    sku: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      match: [
        /^[A-Z0-9][A-Z0-9._-]{1,39}$/,
        "SKU must be 2-40 letters, numbers, dots, dashes or underscores",
      ],
    },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    sortOrder: { type: Number, default: 0 },
    options: {
      colorName: { type: String, trim: true, maxlength: 40 },
      colorHex: { type: String, match: /^#[0-9a-fA-F]{6}$/ },
      pattern: { type: String, trim: true, maxlength: 60 },
      size: { type: String, trim: true, maxlength: 40 },
      _id: false,
    },
    sellingUnit: { type: sellingUnitMongoSchema, required: true },
    pricePaise: intField({ required: true }),
    costPaise: intField(),
    compareAtPaise: intField(),
    salePricePaise: intField(),
    saleStartsAt: Date,
    saleEndsAt: Date,
    stock: {
      onHand: intField({ required: true, default: 0 }),
      reserved: intField({ required: true, default: 0 }),
      _id: false,
    },
    lowStockThreshold: intField({ default: 0 }),
    imageUrl: { type: String, trim: true, maxlength: 500 },
    weightGrams: intField(),
    barcode: { type: String, trim: true, maxlength: 40 },
  },
  { timestamps: true }
)

// Business-rule validation on top of per-field rules. Runs on create and on save.
variantSchema.pre("validate", function () {
  const unit = this.sellingUnit as unknown as { toObject?: () => unknown }
  const parsed = sellingUnitSchema.safeParse(unit?.toObject?.() ?? this.sellingUnit)
  if (!parsed.success) {
    this.invalidate(
      "sellingUnit",
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
    )
  }
  if (this.stock.reserved > this.stock.onHand) {
    this.invalidate("stock.reserved", "reserved stock cannot exceed stock on hand")
  }
  if (this.salePricePaise !== undefined && this.salePricePaise >= this.pricePaise) {
    this.invalidate("salePricePaise", "sale price must be lower than the regular price")
  }
  if (this.compareAtPaise !== undefined && this.compareAtPaise <= this.pricePaise) {
    this.invalidate("compareAtPaise", "compare-at price must be higher than the regular price")
  }
  if (this.saleStartsAt && this.saleEndsAt && this.saleEndsAt <= this.saleStartsAt) {
    this.invalidate("saleEndsAt", "sale must end after it starts")
  }
})

variantSchema.index({ productId: 1, status: 1 })
// Low-stock report: only variants that actually hold stock.
variantSchema.index({ "stock.onHand": 1 }, { partialFilterExpression: { status: "active" } })

export const ProductVariant = modelFor<ProductVariantDoc>("ProductVariant", variantSchema)
