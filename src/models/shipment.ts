import { Schema } from "mongoose"
import { SHIPMENT_STATUSES, type ShipmentStatus } from "@/lib/shipping/types"
import { intField, modelFor, type Id } from "./_shared"

export interface ShipmentDoc {
  _id: Id
  orderId: Id
  provider: "shiprocket" | "mock"
  providerOrderId: string
  awb: string
  courier: string
  status: ShipmentStatus
  trackingUrl?: string
  labelUrl?: string
  parcel: { weightGrams: number; lengthMm: number; widthMm: number; heightMm: number }
  events: { status: ShipmentStatus; at: Date; location?: string; note?: string }[]
  deliveredAt?: Date
  createdBy?: Id
  createdAt: Date
  updatedAt: Date
}

const schema = new Schema<ShipmentDoc>(
  {
    orderId: { type: Schema.Types.ObjectId, required: true },
    provider: { type: String, enum: ["shiprocket", "mock"], required: true },
    providerOrderId: { type: String, required: true },
    awb: { type: String, required: true, unique: true },
    courier: { type: String, required: true, maxlength: 80 },
    status: { type: String, enum: SHIPMENT_STATUSES, default: "created" },
    trackingUrl: { type: String, maxlength: 500 },
    labelUrl: { type: String, maxlength: 500 },
    parcel: {
      weightGrams: intField({ required: true, min: 1 }),
      lengthMm: intField({ required: true, min: 1 }),
      widthMm: intField({ required: true, min: 1 }),
      heightMm: intField({ required: true, min: 1 }),
      _id: false,
    },
    events: {
      type: [
        new Schema(
          {
            status: { type: String, enum: SHIPMENT_STATUSES, required: true },
            at: { type: Date, required: true },
            location: { type: String, maxlength: 120 },
            note: { type: String, maxlength: 300 },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    deliveredAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
)
schema.index({ orderId: 1 })
// The sync job looks for shipments still moving.
schema.index({ status: 1, updatedAt: 1 })

export const Shipment = modelFor<ShipmentDoc>("Shipment", schema)
