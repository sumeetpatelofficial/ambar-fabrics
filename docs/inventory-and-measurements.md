# Inventory and Measurements

## 1. Principles

- Money: integer **paise** (`1 ₹ = 100 paise`). Currency fixed to `INR` per order, stored explicitly.
- Quantity: integer in the item's **base unit**. No floats in storage, pricing, or stock.
- Display units are derived from the base unit by a pure conversion in `lib/measure`.
- One module (`lib/measure`, `lib/money`) is the only place that converts or rounds.

## 2. Unit model

Each sellable variant carries a `sellingUnit` block:

```ts
sellingUnit: {
  kind: 'length' | 'piece' | 'set' | 'pair' | 'pack'
  baseUnit: 'mm' | 'each'            // what stock and cart quantities are stored in
  displayUnit: 'm' | 'cm' | 'each' | 'set' | 'pair' | 'pack'
  baseUnitsPerDisplayUnit: number    // m→1000, each/set/pair/pack→1
  pricePerBaseUnits: number          // price is quoted per this many base units (1000 = per metre; 1 = per piece)
  minQty: number                     // base units, e.g. 500 (0.5 m) or 1
  stepQty: number                    // increment in base units, e.g. 500 or 1
  maxQtyPerOrder?: number            // base units
}
```

Rules validated by Zod and Mongoose validators:

- all numbers are positive safe integers
- `minQty % stepQty === 0`
- `maxQtyPerOrder % stepQty === 0` when set
- `pricePerBaseUnits % stepQty === 0` is not required, but `pricePerBaseUnits ≥ 1`
- `kind='length'` requires `baseUnit='mm'`; the rest require `each`

Examples (fictional prices, for tests only):

| Product                 | kind   | baseUnit | pricePerBaseUnits | price (paise) | min  | step |
| ----------------------- | ------ | -------- | ----------------- | ------------- | ---- | ---- |
| Cotton fabric ₹180/m    | length | mm       | 1000              | 18000         | 500  | 500  |
| Printed fabric ₹250/m   | length | mm       | 1000              | 25000         | 500  | 500  |
| Lace ₹35/m              | length | mm       | 1000              | 3500          | 1000 | 100  |
| 3-piece suit ₹1,499/set | set    | each     | 1                 | 149900        | 1    | 1    |
| Latkan ₹80/pair         | pair   | each     | 1                 | 8000          | 1    | 1    |

Why mm: the finest realistic cut is a centimetre or half-centimetre, and mm gives headroom without fractions. Metres are never stored.

## 3. Pricing arithmetic

```
lineSubtotalPaise = roundHalfUp(unitPricePaise × qtyBase / pricePerBaseUnits)
```

- Example: ₹200/m (20000 paise per 1000 mm), 2.5 m = 2500 mm → `20000 × 2500 / 1000 = 50000` paise = **₹500**. ✔ matches the brief.
- Example needing rounding: ₹35/m, 1.1 m → `3500 × 1100 / 1000 = 3850` paise exactly. ₹37/m, 0.1 m → `3700 × 100 / 1000 = 370`. ₹33/m, 0.1 m (=100 mm) → `3300 × 100 / 1000 = 330`. If remainder, e.g. ₹33.33/m (3333 paise), 0.15 m → `3333 × 150 / 1000 = 499.95 → 500` paise.
- Intermediate products stay under 2⁵³: worst case ≈ 10⁷ paise × 10⁶ mm = 10¹³ ≪ 9×10¹⁵. The helper asserts `Number.isSafeInteger` and throws otherwise. It uses integer arithmetic only: `Math.floor((a * b * 2 + d) / (2 * d))` for half-up on non-negative integers. `BigInt` is the fallback if limits are ever raised.
- Rounding happens **once, per line**. Order totals are sums of already-rounded integer lines. Discounts, tax, and shipping are computed on integers with a documented rounding rule (below).

### Discounts and tax order (single engine, D-5)

1. Line subtotals (rounded per line).
2. Item-level promotions → line discounts.
3. Order-level coupon, **allocated pro-rata across lines** with the largest-remainder method, so line allocations sum exactly to the coupon amount. This matters for per-line GST and refunds.
4. Shipping (after rules and free-shipping threshold, evaluated on the post-discount merchandise total, configurable).
5. Tax per line:
   - **Tax-inclusive** (default assumption A-3): `tax = round(lineNet × rate / (100 + rate))`. Base = `lineNet − tax`.
   - **Tax-exclusive**: `tax = round(lineNet × rate / 100)`.
6. Grand total = Σ(lineNet) + shipping (+ tax if exclusive).
7. The order stores every intermediate amount (see `Order.pricing` and `OrderItem` snapshots).

CGST/SGST vs IGST split is derived from the shipping state versus the business state, using config.

## 4. Stock model

Per variant, stored in the **base unit**:

```
stock: { onHand: int ≥ 0, reserved: int ≥ 0 }
available = onHand − reserved       (derived; never stored)
lowStockThreshold: int (base units)
```

Invariant (enforced by guards and checked by a nightly job): `0 ≤ reserved ≤ onHand`.

Fabric rolls and remnants: v1 treats a fabric as a pool of metres per variant. Roll-level tracking (lot, dye lot) is deferred (assumption A-6). A cut that leaves unsellable remnants is handled as a `wastage` adjustment.

### Atomic operations

All are single-document conditional updates on `ProductVariant`. There is no read-then-write.

`reserve(qty)` uses an `$expr` guard on `onHand − reserved`:

```js
filter: { _id, $expr: { $gte: [ { $subtract: ['$stock.onHand', '$stock.reserved'] }, qty ] } }
update: { $inc: { 'stock.reserved': qty } }
// matchedCount === 0  → insufficient stock; whole checkout fails and rolls back reservations already taken
```

- `release(qty)`: `$inc reserved −qty` guarded by `reserved ≥ qty`.
- `commit(qty)` (payment captured): `$inc { onHand: −qty, reserved: −qty }` guarded by `reserved ≥ qty AND onHand ≥ qty`.
- `adjust(delta)` (admin): `$inc onHand` guarded so `onHand + delta ≥ reserved`.
- `restock(qty)` (return received and passed QC): `$inc onHand +qty`.

Multi-line carts: reserve each line in a fixed order (sorted by variant id) inside a transaction to avoid lock-order deadlocks. A failure aborts the transaction.

### Reservation lifecycle

| Event                                          | Action                                                                                                                                        |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Checkout started (`POST /checkout`)            | create `InventoryReservation` per line, `status=active`, `expiresAt = now + 20 min` (configurable, A-5); `reserved += qty`                    |
| Payment captured (webhook/verify)              | reservation → `committed`; `commit(qty)`                                                                                                      |
| Payment failed, user abandons, expiry          | reservation → `released`/`expired`; `release(qty)`                                                                                            |
| Retry payment on same order within TTL         | reuse reservation; extend `expiresAt` once                                                                                                    |
| Expiry cron (every minute)                     | claim expired `active` reservations atomically, release, mark order `expired` unless a captured payment is found by reconciliation first      |
| Payment captured **after** reservation expired | try to re-reserve; if stock exists → commit and fulfil; otherwise flag the order `needs_attention` and auto-start a full refund (admin alert) |
| Cancel (pre-shipment, paid)                    | release is impossible (already committed) → `restock` movement + refund                                                                       |
| Return received & accepted                     | `restock` movement (optional per item condition)                                                                                              |

Cart add does **not** reserve stock (cart only validates). Reservation starts at checkout.

### Inventory movements (audit trail)

Every change to `onHand` or `reserved` writes an `InventoryMovement` (`type`: `reserve|release|commit|adjust|restock|wastage|correction`, `delta`, `before/after`, `orderId?`, `actorId?`, `reason`, `idempotencyKey`). The unique index on `idempotencyKey` makes retries safe: a duplicate insert aborts the transaction and no stock change is applied.

### Display

- Length variants display as metres with up to 2 decimals trimmed: `2500 mm → "2.5 m"`; `1250 mm → "1.25 m"`. Never display or edit raw mm in the storefront.
- Admin stock entry accepts metres (decimal string) and converts with `parseDisplayToBase()`, which rejects more precision than the base unit allows (for example 3 decimals of a metre is exact in mm; 4 decimals is rejected).
- Availability messages: `In stock`, `Only X m left` (when `available ≤ lowStockThreshold`), `Out of stock`, `Max N m per order`.
- Quantity selector offers `min`, `step` and `max = min(maxQtyPerOrder, available)`. Server re-validates the same rules.

## 5. Server validation (shared by cart, checkout, admin)

`validateQuantity(unit, qty)` returns a typed result:

- `qty` is a safe positive integer
- `qty ≥ minQty`
- `(qty − minQty) % stepQty === 0` (steps counted from the minimum, so min 1000 step 100 allows 1000, 1100, ...)
- `qty ≤ maxQtyPerOrder` when set
- and (at checkout) `qty ≤ available`

Rejected with `QUANTITY_INVALID` / `QUANTITY_BELOW_MIN` / `QUANTITY_BAD_STEP` / `QUANTITY_EXCEEDS_MAX` / `INSUFFICIENT_STOCK`.

## 6. Tests required in Phase 3

- Property tests (fast-check): `format(parse(x)) === x`; for random valid `(price, qty)` the result is a safe integer and never differs from exact rational rounding by more than 1 paise.
- Table tests for the five example products and the ₹200 × 2.5 m = ₹500 case.
- Coupon allocation sums exactly to the coupon amount for random line sets.
- Concurrency: 50 parallel reservations of 1 m against 10 m stock produce exactly 10 successes and `reserved === onHand`.

## 7. As implemented in Phase 3

- `src/lib/money.ts`: `formatPaise`, `rupeesToPaise` (strict parser, no floats), `paiseToRupeeString`, `percentOff` (rounds down), `mulDivRound` (integer half-up, throws rather than lose precision), `allocate` (largest remainder, sums exactly).
- `src/lib/measure.ts`: `sellingUnitSchema` (Zod, rejects inconsistent units), `units.perMetre()` / `units.each()` constructors, `lineSubtotalPaise`, `validateQuantity`, `maxOrderableQty`, `formatQuantity`, `parseDisplayQuantity` (rejects extra precision instead of rounding), `priceUnitLabel`.
- `src/lib/inventory.ts`: `availableQty` and `availability` (status and customer wording; exact stock is shown only at or below the low-stock threshold).
- Verified by tests: Rs 200/m x 2.5 m = Rs 500; all five documented sample products; 5,000 random cases of `mulDivRound` against exact big-integer arithmetic; `allocate` always sums to the total; `maxOrderableQty` only returns quantities that pass `validateQuantity`; every millimetre round-trips through display and parse.
- Not built yet (Phase 6): reservations, atomic reserve/release/commit, and the InventoryMovement ledger.

## 8. As implemented in Phase 6

- `services/inventory-service.ts`: `reserveStock`, `commitReservation`, `releaseReservation`, `expireDueReservations`, `adjustStock`, with the guards and movement keys described above (`reserve:<order>:<variant>`, `commit:...`, `release:...`). Reservation and settlement run in transactions; the reserve guard uses `$expr` on `onHand - reserved`.
- `services/cart-service.ts`: `priceLines`, `addToCart`, `setCartQuantity`, `removeFromCart`, `mergeGuestBag`. Cart add does not reserve stock.
- Verified by integration tests: 50 parallel reservations of 1 m against 10 m give exactly 10 successes and `reserved === onHand`.
