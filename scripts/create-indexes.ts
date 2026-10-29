/**
 * Creates and reconciles indexes. Production runs with autoIndex off, so run this on deploy:
 *   pnpm db:indexes            list what would change (dry run)
 *   pnpm db:indexes --yes      create missing indexes and drop ones no longer in the schemas
 */
import mongoose from "mongoose"
import { connectDb } from "@/lib/db/mongoose"
import { Address } from "@/models/address"
import { AuditLog } from "@/models/audit-log"
import { AuthAccount } from "@/models/auth-account"
import { AuthToken } from "@/models/auth-token"
import { Category } from "@/models/category"
import { Collection } from "@/models/collection"
import { Job } from "@/models/job"
import { Product } from "@/models/product"
import { ProductVariant } from "@/models/product-variant"
import { RateLimitBucket } from "@/models/rate-limit-bucket"
import { Redirect } from "@/models/redirect"
import { SiteSettings } from "@/models/site-settings"
import { User } from "@/models/user"
import { Wishlist } from "@/models/wishlist"
import { Order } from "@/models/order"
import { Payment } from "@/models/payment"
import { Refund } from "@/models/refund"
import { Coupon, CouponRedemption } from "@/models/coupon"
import { Counter } from "@/models/counter"
import { WebhookEvent } from "@/models/webhook-event"
import { Shipment } from "@/models/shipment"
import { ReturnRequest } from "@/models/return-request"
import { Review } from "@/models/review"
import { Taxon } from "@/models/taxon"
import { ContentPage } from "@/models/content-page"
import { Cart } from "@/models/cart"
import { InventoryMovement } from "@/models/inventory-movement"
import { InventoryReservation } from "@/models/inventory-reservation"
import { describeTarget, loadEnv } from "./lib/script-env"

// Every collection with indexes, including the TTL indexes that expire tokens, finished jobs and rate-limit counters.
const models = [
  Address,
  AuditLog,
  AuthAccount,
  AuthToken,
  Category,
  Collection,
  Job,
  Product,
  ProductVariant,
  RateLimitBucket,
  Redirect,
  SiteSettings,
  User,
  Wishlist,
  Cart,
  Review,
  Taxon,
  ContentPage,
  Shipment,
  ReturnRequest,
  Order,
  Payment,
  Refund,
  Coupon,
  CouponRedemption,
  Counter,
  WebhookEvent,
  InventoryMovement,
  InventoryReservation,
]

async function main() {
  loadEnv()
  console.log(
    `Target database: ${describeTarget(process.env.MONGODB_URI ?? "") || "(MONGODB_URI is not set)"}`
  )
  await connectDb()
  const apply = process.argv.includes("--yes")
  for (const model of models) {
    if (apply) {
      const dropped = await model.syncIndexes()
      console.log(
        `${model.modelName}: synced${dropped.length ? `, dropped ${dropped.join(", ")}` : ""}`
      )
    } else {
      const diff = await model.diffIndexes()
      console.log(
        `${model.modelName}: would create ${diff.toCreate.length}, drop ${diff.toDrop.length}`
      )
    }
  }
  if (!apply) console.log("Dry run. Re-run with --yes to apply.")
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => mongoose.disconnect())
