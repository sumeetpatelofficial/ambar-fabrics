# Order, Payment, Refund, Shipment, and Return Lifecycles

Each state machine is a typed transition table in `features/orders/state.ts` (etc.). Services call `transition(entity, event, actor)`. It validates the transition, writes the new state with a **compare-and-set** (`updateOne({_id, status: from}, {status: to})`), appends to `statusHistory`, and no-ops if already in the target state. There is no code path that writes `status` directly.

## 1. Order

Two orthogonal axes plus one lifecycle status, to avoid one overloaded field.

**`status`** (lifecycle): `pending_payment → confirmed → processing → completed`, with side exits `cancelled`, `expired`, `needs_attention`.
**`paymentStatus`**: `unpaid | paid | partially_refunded | refunded | failed`.
**`fulfillmentStatus`**: `unfulfilled | packed | shipped | out_for_delivery | delivered | returned | rto`.

```
            checkout
 ┌───────────────────────────┐
 │ pending_payment           │──timeout/abandon──► expired   (reservation released)
 │ paymentStatus=unpaid      │──payment.failed ──► pending_payment (paymentStatus=failed, retry allowed within TTL)
 └────────────┬──────────────┘──customer cancel ─► cancelled (reservation released)
              │ payment captured (verified)
              ▼
 confirmed (paid, stock committed) ──admin starts──► processing ──shipment created──► (fulfillment: packed/shipped…)
              │                                              │
              │ cancel before ship (refund)                  │ delivered ─► completed (after return window closes, A-9)
              ▼                                              ▼
          cancelled (+refund)                        return flow (§5)
```

Allowed transitions:

| From                 | Event                             | To                                                           | Side effects                                                                     |
| -------------------- | --------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| —                    | `checkout.created`                | pending_payment                                              | order + reservations + Razorpay order (one transaction for DB part)              |
| pending_payment      | `payment.captured`                | confirmed                                                    | commit stock, `paymentStatus=paid`, enqueue confirmation email, GA purchase flag |
| pending_payment      | `payment.failed`                  | pending_payment                                              | `paymentStatus=failed`; keep reservation until expiry                            |
| pending_payment      | `expire` / `customer.cancel`      | expired / cancelled                                          | release stock, close Razorpay order (best effort)                                |
| pending_payment      | `payment.captured` (after expiry) | confirmed or needs_attention                                 | re-reserve; if impossible → refund (see inventory doc)                           |
| confirmed            | `admin.process`                   | processing                                                   |                                                                                  |
| confirmed/processing | `cancel` (pre-shipment)           | cancelled                                                    | restock + refund                                                                 |
| processing           | `shipment.created`                | processing (`fulfillment=packed`)                            |                                                                                  |
| processing           | `shipment.delivered`              | processing (`fulfillment=delivered`)                         | start return window timer                                                        |
| processing           | `return_window.closed`            | completed                                                    |                                                                                  |
| any paid             | `refund.processed`                | same status; `paymentStatus` → partially_refunded / refunded |                                                                                  |

Forbidden (enforced by the table and tested): shipping an unpaid order; marking delivered with no shipment; cancelling after `shipped` (a return/RTO flow is used instead); refunding more than captured minus refunded; reviving `cancelled`/`expired` orders (a new checkout is required).

Order numbers: configurable pattern, default `AM-{YY}{MM}-{SEQ6}`, `SEQ` from an atomic counter document (`findOneAndUpdate $inc`). Counters never reuse numbers, and gaps are acceptable except for **invoice numbers**, which use a separate gapless-per-financial-year sequence assigned only at invoice generation (A-8).

Customer-facing `/track-order` needs `orderNumber + email/phone` plus rate limiting. The response contains only status and tracking data, no addresses.

## 2. Payment (Razorpay)

`Payment.status`: `created → authorized → captured` | `failed`; `captured → partially_refunded → refunded`.

| Razorpay event                                          | Handling                                                                                                                                                              |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `payment.authorized`                                    | `authorized`. We use **auto-capture** (set in the Razorpay dashboard or `payment_capture` on order), so this is transient. If auto-capture is off, a job captures it. |
| `payment.captured` / `order.paid`                       | `markPaymentCaptured(razorpayOrderId, paymentId)` (idempotent)                                                                                                        |
| `payment.failed`                                        | `failed`, store error code and reason (no card data)                                                                                                                  |
| `refund.created` / `refund.processed` / `refund.failed` | update `Refund` row, then order `paymentStatus`                                                                                                                       |

`markPaymentCaptured` steps, all inside one transaction, no-op if already captured:

1. Load `Payment` by `razorpayOrderId`. Reject if the order is missing or its amount/currency differ from the captured payment.
2. CAS `Payment.status` → `captured`. If the CAS fails because it is already captured, return OK.
3. CAS `Order.status` pending_payment → confirmed. Commit reservations (idempotent through `InventoryMovement.idempotencyKey = commit:{orderId}:{variantId}`).
4. Insert outbox jobs (confirmation email, shipment suggestion).

**Idempotency sources:** `WebhookEvent.eventId` unique (header `X-Razorpay-Event-Id`); `Payment.razorpayPaymentId` unique sparse; `Order.idempotencyKey` unique (client sends `Idempotency-Key` on checkout; same key + same body returns the same order; same key + different body = 422); movement keys above.

**Out-of-order / duplicate / delayed events:** each handler is a pure convergent function of "fetch current truth". On any ambiguous event (for example `refund.processed` before our refund row exists), handlers fetch the entity from Razorpay and upsert. A reconciliation cron (every 10 min) covers: orders in `pending_payment` older than 5 minutes → fetch Razorpay order payments; `captured` payments with no matching order state; refunds `pending` > 1 h.

**Amount checks:** trust no client amount. The order amount is the DB `order.pricing.totalPaise`; the Razorpay order is created from it, and verification compares the fetched payment `amount`, `currency` to it.

Webhook endpoint: reads raw text, verifies signature using `crypto.timingSafeEqual`, inserts `WebhookEvent{eventId, type, payloadHash, receivedAt, processedAt?, attempts}`. Verification failure → 400 and a log (no payload echo). Processing errors → 500 so Razorpay retries (the event row is kept with `error`); duplicates → 200.

## 3. Refund

`Refund.status`: `requested → approved → initiated → processed` | `rejected` | `failed`.

- Customer cancel (pre-ship, paid): auto-approved for the full captured amount minus nothing (policy configurable).
- Return accepted: refund amount = returned lines' `lineNet` (+ proportionate shipping if policy) − return shipping fee if the customer is liable.
- Admin initiates (permission `refunds:create`; threshold for super-admin approval is configurable, A-10). Service calls `PaymentProvider.refund(paymentId, amount, speed, notes{refundId})` using `Refund._id` as an idempotency reference. Provider reply → `initiated`; webhook → `processed`/`failed`.
- Guard: Σ refunds (not rejected/failed) ≤ captured amount, enforced with a conditional update on `Payment.refundedPaise`.
- COD orders (if enabled later) refund through manual bank transfer and are tracked as `manual`.

## 4. Shipment

`Shipment.status`: `pending → booked → pickup_scheduled → picked_up → in_transit → out_for_delivery → delivered` with exits `failed_delivery → (in_transit | rto_initiated) → rto_delivered`, `cancelled`, `lost`.

- Only a `confirmed/processing` paid order may get a shipment. Create it with the provider's idempotency/ref = `orderNumber-attemptN`.
- Provider status → our status through a mapping table in the adapter (unknown provider statuses become `in_transit` + raw status stored; they never throw).
- Webhook (Shiprocket) is verified by its shared token header; a reconciliation cron polls tracking for all non-terminal shipments every 30 min.
- `delivered` → `Order.fulfillmentStatus=delivered`, set `deliveredAt`, enqueue delivery email, start return window.
- No UI text claims "shipped"/"booked" until the adapter returns a provider-confirmed AWB. Mock adapter output is labelled "MOCK" in the admin and blocked in production.
- Partial shipments: v1 one shipment per order (A-7). The schema allows many.

## 5. Return request

`ReturnRequest.status`: `requested → approved | rejected → pickup_scheduled → received → inspected → refunded | refund_rejected` and `closed`.
Eligibility: order delivered, within `returnWindowDays` (settings), item flagged `returnable` (fabric cut to length is typically **non-returnable**, a policy decision, A-9), reason from a configured list, evidence photos optional. One active request per line. Approval by `returns:manage`. On `received → inspected` the admin chooses `restock | wastage` per line and a refund amount (capped). Everything is written to `statusHistory` with actor and note.

## 5a. Sales made in the shop (`channel: "store"`)

Staff with `orders:create_offline` (admin, super admin) record an over-the-counter sale at **Admin → Orders → Add order**.

- The order is created already `completed`, `paid`, fulfilment `delivered`; stock leaves the shelf at once (a reservation is made and committed in the same request, so the usual movements are written). Payment is one `store` payment row marked `captured` with the method (cash, UPI or card). Nothing goes through Razorpay, no email is sent, nothing is shipped.
- Owned by one hidden, suspended walk-in account (`walk-in@in-store.invalid`). Name and phone, if given, are only written on the bill. The account is left out of the customers list, the new-customer figure and the buyer counts.
- Price is today's shop price. An optional discount on the whole bill (rupees or percent) needs a reason; the reason is kept on the order and in the audit log (`order.store_sale`). The total must be at least ₹1. Shipping is zero.
- A numbered Bill of Supply is issued immediately (same gapless series as online orders) and shows no delivery address.
- **Void** (`store.void`, `completed → cancelled`, payment `refunded`) is for a mistake: stock is put back (`restock` movements), once only, audit `order.store_void`. Money is returned outside the system.
- Reports: counted as sales and in profit; not in "to ship", the checkout funnel or "who bought"; "Where sold" splits online and in-shop.
- Not covered: customer accounts, returns or exchanges from a counter sale, pay later, part payments.

## 6. Time-based jobs (Vercel Cron → `/api/cron/*`, bearer `CRON_SECRET`)

| Job                   | Interval | Purpose                                                                                  |
| --------------------- | -------- | ---------------------------------------------------------------------------------------- |
| `jobs.drain`          | 1 min    | email and outbox processing with retry and backoff (max 8 attempts, then `dead` + alert) |
| `reservations.expire` | 1 min    | release expired reservations, expire orders                                              |
| `payments.reconcile`  | 10 min   | see §2                                                                                   |
| `shipments.sync`      | 30 min   | tracking sync                                                                            |
| `inventory.audit`     | daily    | invariant check, low-stock digest                                                        |
| `analytics.rollup`    | daily    | `AnalyticsSummary` for completed days                                                    |
| `cleanup`             | daily    | expired tokens, old webhook payloads (retain 90 days), stale carts (60 days)             |

Vercel Cron frequency depends on plan (Hobby is daily only). Production needs a plan that allows minute-level crons, or an equivalent external scheduler. See `deployment.md`.
