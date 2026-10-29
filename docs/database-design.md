# Database Design (MongoDB Atlas + Mongoose 9)

## 1. Conventions

- `_id`: ObjectId. Public identifiers: `slug` (catalog), `orderNumber` (orders). Neither exposes sequential database IDs.
- Money: integer paise (`*Paise` suffix). Quantities: integer base units (`*Qty`). Dates: UTC `Date`.
- All collections have `createdAt/updatedAt` (Mongoose timestamps) and `__v` optimistic-concurrency for admin-edited docs.
- Mongoose `strict: true`, `strictQuery: true`, `sanitizeFilter: true` globally (NoSQL-injection defence), plus Zod at the boundary.
- Soft state: `status` enums instead of hard deletes for catalog, users, and orders. Hard deletes only for tokens, carts, and expired data.
- Indexes are declared in schemas and also created by `scripts/create-indexes.ts` (`autoIndex: false` in production).
- Embedding rule: embed things that are read together and bounded (images, addresses ≤ 10, status history ≤ ~50); reference things that are unbounded or independently queried.
- All reads for lists use pagination (cursor for large collections: orders, movements, audit logs; offset for admin tables under ~10k).

## 2. Collections

Legend: **R** required, **U** unique, **TTL** expiry index.

### User

`email` R U (lowercased, indexed), `name`, `phone` (E.164, optional, not unique), `passwordHash` (absent for OAuth-only; `select:false`), `emailVerified: Date|null`, `role` enum (customer, support, catalog_manager, fulfillment_manager, admin, super_admin) default `customer`, `status` enum (active, suspended, deleted), `sessionVersion` int, `failedLoginCount`, `lockedUntil`, `marketingConsent{email,whatsapp,at}`, `lastLoginAt`, `defaultAddressId`.
Indexes: `{email:1}` U; `{role:1,status:1}`.
Access: user reads/updates only own profile through `accountService`. Role changes only by `users:manage_roles`. `passwordHash` never serialized (toJSON transform + `select:false`).
Retention: deletion = anonymize PII, keep orders (legal retention for invoices, A-12).

### Account (linked identity)

`userId` R, `provider` R (`google`), `providerAccountId` R, `emailAtLink`, `linkedAt`.
Indexes: `{provider:1, providerAccountId:1}` U; `{userId:1}`.

### Address

`userId` R, `label`, `fullName`, `phone`, `line1`, `line2`, `landmark`, `city`, `state` (enum of Indian states and UTs), `pincode` (`^[1-9][0-9]{5}$`), `country='IN'`, `isDefaultShipping`, `isDefaultBilling`, `gstin?`.
Indexes: `{userId:1}`. App-enforced ≤ 10 per user. Always queried with `userId` from the session.

### Category

`name`, `slug` U, `parentId?` (one level of nesting in v1, depth ≤ 2), `ancestors[]`, `description`, `image`, `sortOrder`, `status` (active, hidden), `seo{title,description,canonical?,noindex,ogImage?}`.
Indexes: `{slug:1}` U; `{parentId:1,sortOrder:1}`.

### Collection

`name`, `slug` U, `description`, `image`, `type` (manual | smart), `rules[]` (for smart: tag/category/price rules), `productIds[]` (manual, bounded ≤ 500), `status`, `startsAt?/endsAt?` (seasonal, for example Navratri), `seo{...}`.
Indexes: `{slug:1}` U; `{status:1,startsAt:1,endsAt:1}`.

### Product

`name` R, `slug` R U, `status` (draft, active, archived), `shortDescription`, `description` (sanitized rich text, stored as restricted HTML or portable JSON, decided in Phase 3), `categoryIds[]` (primary at index 0), `collectionIds[]` (denormalized for filters; source of truth is Collection manual lists or rules, with sync on save), `brand?`, `tags[]`, `searchKeywords[]`,
`attributes{ fabricType, material, composition, pattern, colorFamily[], width{mm}, careInstructions[], origin, occasion[] }` (fixed typed keys for filters; `extra: Map<string,string>` for the rest),
`images[{publicId,url,alt,width,height,sortOrder}]`,
`hsnCode`, `taxRatePercent` (nullable → falls back to category or settings default), `taxClass`,
`weightGrams`, `dimensionsMm{l,w,h}`, `returnable` bool,
`flags{featured, bestseller, newArrival}`, `newUntil?`,
`priceRange{minPaise,maxPaise}` (denormalized from variants, maintained in service), `inStock` bool (denormalized, same), `soldCount` (denormalized, incremented at commit),
`ratingAvg`, `ratingCount` (denormalized from approved reviews), `seo{...}`, `publishedAt`, `createdBy`, `updatedBy`.
Indexes: `{slug:1}` U; `{status:1,'categoryIds':1,publishedAt:-1}`; `{status:1,collectionIds:1}`; `{status:1,'priceRange.minPaise':1}`; `{status:1,flags.bestseller:1,soldCount:-1}`; text index on `name, tags, searchKeywords` for v1 search (Atlas Search upgrade path, decided by measurement, A-13); `{ 'attributes.fabricType':1, status:1 }`, `{ 'attributes.colorFamily':1, status:1 }`, `{ 'attributes.pattern':1, status:1 }` (verified with `explain()` in Phase 3).
Access: public API returns only `status=active`. Slug changes write a `Redirect`.

### ProductVariant

`productId` R, `sku` R U, `status`, `options{ color{name,hex}, pattern, size?, ... }`, `sellingUnit{...}` (see inventory doc), `pricePaise` R (per `pricePerBaseUnits`), `compareAtPaise?` (MRP / strike-through), `salePricePaise?`, `saleStartsAt?/EndsAt?`, `stock{onHand,reserved}`, `lowStockThreshold`, `image?`, `weightGrams?` (per base-unit-step for lengths: grams per metre, used for shipping), `barcode?`.
Indexes: `{sku:1}` U; `{productId:1,status:1}`; `{ 'stock.onHand':1 }` (low-stock report, partial).
Effective price at read time = sale price if inside its window, else `pricePaise`. The engine only reads the effective price, so it is evaluated once.
Why separate from Product: stock is the hot, concurrent write path. Isolating it keeps product documents cacheable and avoids write amplification.

### Cart

`userId?` (U sparse), `guestToken?` (U sparse, random 128-bit, httpOnly cookie, stored hashed), `items[{variantId, qty, addedAt}]` (bounded ≤ 50), `couponCode?`, `expiresAt` (**TTL**, guest 30 days rolling, user 90 days), `mergedInto?`.
Stores **no prices**. Prices are always recalculated from the catalog. Merge on login: for the same variant, qty is summed then re-validated against min/step/max (clamped with a notice). The guest cart is deleted afterwards.

### Order

`orderNumber` R U, `userId?` (guest checkout allowed? **A-4: login required in v1**; the field stays optional for future guests), `email`, `phone`, `status`, `paymentStatus`, `fulfillmentStatus`,
`items[]` (embedded **OrderItem snapshots** — bounded ≤ 50, so embedded; `OrderItem` is not a separate collection): `{variantId, productId, sku, name, variantLabel, image, hsnCode, taxRatePercent, sellingUnit snapshot, qty, unitPricePaise, pricePerBaseUnits, lineSubtotalPaise, lineDiscountPaise, lineTaxPaise, lineTotalPaise, returnable, fulfilledQty, returnedQty, refundedPaise}`,
`pricing{ subtotalPaise, discountPaise, couponCode, couponId, shippingPaise, taxPaise, totalPaise, taxMode, currency='INR', roundingPaise }`,
`shippingAddress{...}` (snapshot), `billingAddress{...}`, `gstin?`, `shippingMethod{code,name,etaDays,providerQuoteRef}`,
`idempotencyKey` U (per user), `razorpayOrderId` U sparse, `paymentId` (ref), `reservationExpiresAt`, `statusHistory[{from,to,event,actorType,actorId,at,note}]`, `notes[{authorId,body,at}]` (internal), `invoice{number U sparse, issuedAt, pdfKey}`, `cancelledAt/by/reason`, `deliveredAt`, `placedAt` (when `confirmed`), `source`/`utm{...}` (first-touch attribution), `analyticsPurchaseSent` bool.
Indexes: `{orderNumber:1}` U; `{userId:1,createdAt:-1}`; `{status:1,createdAt:-1}`; `{paymentStatus:1,createdAt:-1}`; `{fulfillmentStatus:1,createdAt:-1}`; `{razorpayOrderId:1}` U sparse; `{userId:1,idempotencyKey:1}` U; `{email:1,createdAt:-1}`; `{status:1,reservationExpiresAt:1}` partial (`status:'pending_payment'`); `{placedAt:-1}` for reports.
Immutable after creation: `items[*]` snapshot fields, `pricing`, and addresses (changes through admin = new audited `addressCorrection` entry, not a rewrite).
Retention: 8 years minimum for invoice-bearing orders (A-12, confirm with the accountant).

### Payment

`orderId` R, `provider='razorpay'`, `razorpayOrderId` R U, `razorpayPaymentId` U sparse, `status`, `amountPaise`, `currency`, `method` (upi, card, netbanking, wallet, emi...; **method name only**), `bank?`, `vpaMasked?`, `cardNetwork? & last4?` (what Razorpay returns, never full PAN), `errorCode?`, `errorReason?`, `capturedAt`, `refundedPaise`, `attempts[{razorpayPaymentId,status,error,at}]`, `signatureVerifiedAt`, `rawLastEvent` (trimmed, no PII).
Indexes: `{orderId:1}`; `{status:1,createdAt:-1}`; U on razorpay IDs.

### Refund

`orderId`, `paymentId`, `razorpayRefundId` U sparse, `amountPaise`, `status`, `reason`, `lines[{sku,qty,amountPaise}]`, `requestedBy`, `approvedBy`, `returnRequestId?`, `speed`, `processedAt`, `failureReason`.
Indexes: `{orderId:1}`; `{status:1,createdAt:-1}`.

### InventoryMovement

`variantId`, `type`, `deltaOnHand`, `deltaReserved`, `onHandAfter`, `reservedAfter`, `orderId?`, `reservationId?`, `actorId?`, `reason`, `idempotencyKey` R U.
Indexes: `{variantId:1,createdAt:-1}`; `{orderId:1}`; U on key. Append-only, with no update or delete code path. Retention: indefinite (small).

### InventoryReservation

`orderId`, `lines[{variantId,qty}]`, `status` (active, committed, released, expired), `expiresAt`.
Indexes: `{status:1,expiresAt:1}`; `{orderId:1}` U.

### Shipment

`orderId`, `provider`, `providerOrderId`, `providerShipmentId`, `awb` U sparse, `courier`, `status`, `trackingUrl`, `labelUrl?`, `manifestUrl?`, `pickup{scheduledAt,token}`, `items[{sku,qty}]`, `package{weightGrams,dimensionsMm,volumetricWeightGrams}`, `events[{status,rawStatus,location,at}]` (bounded, deduped by `rawStatus+at`), `deliveredAt`, `isMock` bool, `lastSyncedAt`.
Indexes: `{orderId:1}`; `{status:1,lastSyncedAt:1}` partial on non-terminal; `{awb:1}` U sparse.

### Coupon

`code` R U (upper-case), `type` (percent, fixed, free_shipping), `value`, `maxDiscountPaise?`, `minOrderPaise`, `startsAt`, `endsAt`, `usageLimit?`, `usedCount`, `perUserLimit?`, `eligible{productIds[], categoryIds[], excludeSaleItems}`, `firstOrderOnly`, `stackable=false`, `status`.
Redemptions live in `CouponRedemption{couponId,userId,orderId U, at}` (a small separate collection for per-user counts and idempotent reversal). `usedCount` is incremented with a guarded `$inc` (`usedCount < usageLimit`) at order **creation** and decremented on expiry or cancel, so it cannot be exceeded in a race.
Indexes: `{code:1}` U; `{status:1,startsAt:1,endsAt:1}`; Redemption: `{couponId:1,userId:1}`, `{orderId:1}` U.

### Review

`productId`, `userId`, `orderId` (verified purchase), `rating` 1–5, `title`, `body` (plain text, escaped), `images[]?`, `status` (pending, approved, rejected), `moderatedBy/At`, `helpfulCount`.
Indexes: `{productId:1,status:1,createdAt:-1}`; `{userId:1,productId:1}` U (one review per product per user). Rating aggregates are updated on approval. `AggregateRating` JSON-LD is emitted only if `ratingCount ≥ 1` and the reviews are shown on the page.

### Wishlist

`userId` U, `items[{productId, variantId?, addedAt}]` (≤ 200).

### SiteSettings (singleton, key = `default`)

`store{name,legalName,logo,email,phone,address,gstin,stateCode,pan?}`, `currency`, `tax{enabled (default false until GST registration), mode: inclusive|exclusive, defaultRatePercent, enableIGST}`, `shipping{freeThresholdPaise, flatRatePaise, weightSlabs[], handlingDays, codEnabled, codFeePaise, returnShippingPaise, blockedPincodes[], remoteAreaSurchargePaise}`, `inventory{reservationMinutes, defaultLowStock}`, `orders{numberPattern, returnWindowDays, cancellationPolicy}`, `invoice{prefix, nextSeqByFY}`, `policies{shipping, returns, privacy, terms}` (rich content with `updatedAt`), `seoDefaults{titleTemplate, description, ogImage}`, `social{...}`, `announcement{text,link,enabled}`, `navigation{header[],footer[]}`, `homepage{banners[], featuredCollectionIds[]}`, `analytics{ga4Id?}`, `featureFlags{}`.
Secrets (provider keys) are not stored here. They live in env vars (A-11).
Cached by tag `settings`; revalidated on save; every save is audited.

### EmailVerificationToken / PasswordResetToken

`userId`, `tokenHash` U (SHA-256 of the 32-byte random token; plaintext only in the email link), `expiresAt` (**TTL**), `usedAt?`, `requestIp`. Only the newest unused token per user is valid (older ones are invalidated on issue).

### WebhookEvent

`provider`, `eventId` R, `type`, `payloadHash`, `payload` (trimmed to non-PII fields), `receivedAt`, `processedAt?`, `status` (received, processed, failed, ignored), `attempts`, `error?`.
Indexes: `{provider:1,eventId:1}` U; `{receivedAt:1}` **TTL 90 days**.

### AuditLog

`actorId`, `actorRole`, `action` (`product.update`, `order.refund`, `settings.update`, `user.role_change`, ...), `entityType`, `entityId`, `diff{before,after}` (sensitive fields redacted), `ip`, `userAgent`, `requestId`, `at`.
Indexes: `{entityType:1,entityId:1,at:-1}`; `{actorId:1,at:-1}`; `{action:1,at:-1}`. Append-only at the application level. Retention: 2 years minimum (A-12). Written in the same transaction as the change where the change is a DB write.

### Redirect

`fromPath` U (normalized), `toPath`, `statusCode` (301/302/308), `hitCount`, `createdBy`. Created automatically on slug change and manually by admins. Loop and chain detection on save (max chain length 3, flattened where possible). Looked up in `proxy.ts` through a cached map, or in `notFound` handling (decided in Phase 10).

### ReturnRequest

`orderId`, `userId`, `lines[{sku,qty,reason,condition?,resolution?}]`, `status`, `images[]`, `statusHistory[]`, `refundId?`, `pickup{...}`, `customerNote`, `adminNote`.
Indexes: `{orderId:1}`; `{status:1,createdAt:-1}`; `{userId:1,createdAt:-1}`.

### Job (outbox) — added by D-7

`type`, `payload`, `dedupeKey` U, `status` (queued, running, done, failed, dead), `runAt`, `attempts`, `lockedUntil`, `lastError`.
Indexes: `{status:1,runAt:1}`; `{dedupeKey:1}` U; `{doneAt:1}` **TTL 30 days**.

### Counter

`_id` (e.g. `order:2026-10`), `seq`. Used for order and invoice numbers.

### AnalyticsSummary (optional, Phase 11, only if measured need)

`date`, `granularity`, `metrics{orders, grossPaise, netPaise, refundsPaise, taxPaise, shippingPaise, newCustomers, ...}`, `byCategory[]`, `byProduct[]`. U on `{date,granularity}`.

## 3. Relationships

```
User 1─* Address     User 1─1 Wishlist     User 1─* Account     User 1─0..1 Cart
User 1─* Order 1─1 Payment 1─* Refund       Order 1─* Shipment    Order 1─* ReturnRequest
Order embeds items[] (snapshot)             Order 1─1 InventoryReservation
Category *─* Product *─* Collection         Product 1─* ProductVariant 1─* InventoryMovement
Product 1─* Review *─1 User                 Coupon 1─* CouponRedemption *─1 Order
```

## 4. Update strategy and concurrency

- **Stock, coupon usage, counters, payment/refund totals:** atomic `$inc` with guarded filters. No read-modify-write.
- **State fields:** compare-and-set on the previous status.
- **Admin edits of products/settings:** optimistic concurrency with `__v`/`updatedAt` and `409 CONFLICT`.
- **Denormalized fields** (`priceRange`, `inStock`, `soldCount`, `ratingAvg`): updated in the same service call as their source. A nightly job verifies and repairs them.
- **Transactions:** checkout creation, payment capture, cancel/refund-restock, return restock. Everything else is single-document.
- **Migrations:** `migrate-mongo`-style versioned scripts in `scripts/migrations` (decided Phase 1).

## 5. As implemented in Phase 3 (differences from the plan above)

- **Collections built:** Category, Collection, Product, ProductVariant, SiteSettings, Redirect. The rest arrive with their phases (cart, orders, payments, inventory movements/reservations in Phases 5 to 8).
- **Product description** is plain text (blank line = new paragraph). Rich text needs a sanitiser and is decided with the admin editor in Phase 9.
- **Denormalised card summary on Product** (maintained by `refreshProductSummary`, never edited by hand): `unitKind`, `priceUnitLabel` ("per metre"), `priceRange{minPaise, maxPaise, compareAtMinPaise?}`, `inStock`, `swatches[]`, `variantCount`. A product is only listed when `variantCount >= 1`. Sale windows are evaluated when the summary is computed, so a scheduled refresh (Phase 12 cron) must recompute products whose sale starts or ends between edits. Detail pages always price from variants at request time and are never stale.
- **One unit kind per product.** All variants of a product must use the same selling-unit kind and display unit (`assertConsistentUnits`), so "from Rs 180 per metre" is never ambiguous.
- **Variant `sortOrder`** (then SKU) defines the order of swatches and the variant selector.
- **Selling unit rule:** `pricePerBaseUnits` must equal one display unit (1000 for per-metre), so the price label is literal.
- **Text index** `product_text` over name, tags, search keywords, fabric type, pattern, material and short description, with `default_language: "none"` (no stemming), so craft names such as bandhani or chinon match literally.
- **Search order of precedence:** an exact variant SKU beats text matching.
- **SKUs** are stored upper-case and validated (`^[A-Z0-9][A-Z0-9._-]{1,39}$`).
- **`sanitizeFilter` is on globally.** Any operator object the code builds itself (`$in`, `$gte`, ...) must be wrapped in `mongoose.trusted()`; user input only ever reaches queries as plain values. Aggregation pipelines are not sanitised, so every value there is an ObjectId or a Zod-validated primitive.
- **Indexes** are declared in the schemas (auto-built outside production). `pnpm db:indexes --yes` reconciles them in production; its dry run shows what would change.

## Phase 5 implementation notes

One `AuthToken` collection serves email verification and password reset (hashed, TTL). The wishlist stores product ids per user. The default address is flagged on the address and capped at `MAX_ADDRESSES_PER_USER`. `User` carries `sessionVersion`; `passwordHash` is `select:false`. New collections: AuthAccount, Address, AuthToken, Wishlist, AuditLog, Job, RateLimitBucket.
