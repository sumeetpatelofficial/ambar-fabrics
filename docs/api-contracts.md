# API Contracts

Base path `/api/v1`. JSON only. Contracts are defined as Zod schemas in `features/<domain>/schemas.ts`, which are the single source for validation, TypeScript types, and OpenAPI generation (`zod-openapi`, served at `/api/v1/openapi.json` and a dev-only reference page at `/dev/api-docs`).

## 1. Conventions

**Success:** `200/201` with `{ "data": ..., "meta"?: { "page","pageSize","total","nextCursor" } }`.
**Error envelope (all endpoints):**

```json
{
  "error": {
    "code": "QUANTITY_BAD_STEP",
    "message": "Quantity must be in steps of 0.5 m.",
    "details": [{ "path": "items[0].qty", "issue": "..." }],
    "requestId": "req_..."
  }
}
```

Status codes: 400 malformed, 401 unauthenticated, 403 forbidden (admin API only), 404 not found (also for not-owned resources), 409 conflict (stale update, state-machine violation), 410 gone (expired), 422 validation / business-rule failure, 429 rate-limited, 500 generic (never detailed).
**Auth:** session cookie (Auth.js). No bearer tokens for browsers. Cron routes use `Authorization: Bearer $CRON_SECRET`. The Razorpay webhook uses a signature. The Shiprocket webhook uses a shared token header.
**Idempotency:** `Idempotency-Key` header (UUID) required on `POST /checkout`, `POST /payments/razorpay/verify`, refund and shipment-creation admin calls. The key is stored with a request hash. A replay with the same hash returns the stored response, and a replay with a different hash returns 422.
**Pagination:** `?page&pageSize≤60` (catalog) or `?cursor&limit≤100` (orders, movements, logs). **Sorting/filtering:** whitelisted fields only, defined in Zod enums.
**Caching:** public catalog GETs set `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` with tag revalidation. Everything authenticated is `private, no-store`.
**Every handler** is wrapped by `withApi({ auth, permission, rateLimit, schema, idempotent })`, which performs: request id → origin check (mutations) → rate limit → session/permission → body limit → Zod parse → handler → error mapping → audit hook. A handler without the wrapper fails an ESLint rule.

## 2. Public catalog (no auth)

| Method & path                                      | Purpose                     | Request                                                                                                                                                            | Response                                                                              | Notes                                                 |
| -------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| GET `/products`                                    | list/filter                 | `q, category, collection, minPrice, maxPrice, fabric[], color[], pattern[], availability, sort(relevance\|newest\|price_asc\|price_desc\|popular), page, pageSize` | `data: ProductCard[]`, `meta` + `facets`                                              | 60/min/IP; only `active`                              |
| GET `/products/{slug}`                             | detail                      |                                                                                                                                                                    | `data: Product + variants (effective price, availability label, no raw stock counts)` | 404 for non-active (unless valid admin preview token) |
| GET `/products/{slug}/related`                     | related                     |                                                                                                                                                                    | `ProductCard[]`                                                                       |                                                       |
| GET `/products/suggest?q=`                         | search-as-you-type          |                                                                                                                                                                    | `{ products[], categories[], queries[] }`                                             | 60/min/IP                                             |
| GET `/categories`, `/categories/{slug}`            | tree/detail                 |                                                                                                                                                                    |                                                                                       |                                                       |
| GET `/collections/{slug}`                          | detail + products           | page params                                                                                                                                                        |                                                                                       | respects `startsAt/endsAt`                            |
| GET `/shipping/serviceability?pincode=&cartToken?` | PIN check                   | `pincode` regex                                                                                                                                                    | `{ serviceable, etaDaysMin, etaDaysMax, codAvailable }`                               | 30/min/IP                                             |
| GET `/settings/public`                             | store info and announcement |                                                                                                                                                                    | cached                                                                                | no secrets                                            |

Raw stock counts are never public. Only labels and (when low) a "only X m left" string.

## 3. Cart (session or guest cookie)

| Method & path                    | Purpose                                | Request              | Response                                                                                                                                                      |
| -------------------------------- | -------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/cart`                      | cart with **server-calculated** totals |                      | `{ items[{variantId, qty, display, unitPrice, lineTotal, issues[]}], pricing, couponApplied?, issues[] }`                                                     |
| POST `/cart/items`               | add                                    | `{ variantId, qty }` | cart. 422 on step/min/max/stock                                                                                                                               |
| PATCH `/cart/items/{variantId}`  | set qty                                | `{ qty }`            | cart                                                                                                                                                          |
| DELETE `/cart/items/{variantId}` | remove                                 |                      | cart                                                                                                                                                          |
| POST `/cart/coupon` / DELETE     | apply / remove                         | `{ code }`           | cart. Rate-limited. Generic "not valid" messages for unknown/expired/ineligible, with a specific reason only for the user's own eligibility rules (min order) |
| POST `/cart/merge`               | called after login                     |                      | merged cart                                                                                                                                                   |

## 4. Checkout and payments (auth required)

| Method & path                         | Purpose                                                | Request                                                                                            | Response                                                                                     | Errors                                                                                                |
| ------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| POST `/checkout/quote`                | totals for an address (shipping, tax)                  | `{ addressId \| address, shippingMethod? }`                                                        | `pricing, shippingOptions[]`                                                                 | 422 not serviceable                                                                                   |
| POST `/checkout`                      | create order, reserve stock, create the Razorpay order | `{ addressId, billingAddressId?, shippingMethod, couponCode?, gstin?, note? }` + `Idempotency-Key` | `{ orderNumber, razorpay: { keyId, orderId, amount, currency, prefill{name,email,phone} } }` | 422 `INSUFFICIENT_STOCK` (lists lines), `PRICE_CHANGED` (client must re-confirm with new totals), 409 |
| POST `/payments/razorpay/verify`      | browser callback                                       | `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }`                                   | `{ orderNumber, status }`                                                                    | 400 bad signature; amount mismatch → 422 and alert                                                    |
| POST `/checkout/{orderNumber}/retry`  | new payment attempt on the same pending order          |                                                                                                    | new razorpay payload                                                                         | 410 if reservation expired                                                                            |
| POST `/checkout/{orderNumber}/cancel` | cancel unpaid order                                    |                                                                                                    |                                                                                              |                                                                                                       |
| POST `/webhooks/razorpay`             | provider events                                        | raw body + `X-Razorpay-Signature`, `X-Razorpay-Event-Id`                                           | `200 {}`                                                                                     | 400 invalid signature, 500 to force a retry                                                           |
| POST `/webhooks/shiprocket`           | tracking events                                        | provider payload + token header                                                                    | `200`                                                                                        |                                                                                                       |

## 5. Account (auth required; every query scoped to `session.userId`)

- GET/PATCH `/account/profile` — `{name, phone, marketingConsent}`
- GET/POST `/account/addresses`, PATCH/DELETE `/account/addresses/{id}`, POST `/account/addresses/{id}/default`
- GET `/orders?cursor` (own), GET `/orders/{orderNumber}`, GET `/orders/{orderNumber}/invoice` (PDF, only once the invoice is issued), GET `/orders/{orderNumber}/tracking`
- POST `/orders/{orderNumber}/cancel-request`, POST `/orders/{orderNumber}/returns` (items, reasons, images)
- GET `/returns`, GET `/returns/{id}`
- GET/POST/DELETE `/wishlist`
- POST `/reviews` (verified purchase only), PATCH/DELETE own review
- POST `/account/password` (change; current password required when one exists), POST `/account/password/set` (OAuth-only users, requires recent re-auth)
- POST `/account/sessions/revoke-all`
- POST `/track-order` `{ orderNumber, email }` → limited status view (public, rate-limited, same response timing for miss and hit)

## 6. Auth

Auth.js owns `/api/auth/*` (signin, callback, signout, csrf, session). Custom endpoints:
POST `/auth/register`, POST `/auth/verify-email`, POST `/auth/resend-verification`, POST `/auth/forgot-password`, POST `/auth/reset-password`. These always return generic success text where an account's existence could leak. Rate-limited as per `security.md`.

## 7. Admin (`/api/v1/admin/*`, permission shown in brackets)

Mostly consumed by admin UI through Server Actions that call the same services. The REST surface exists for bulk, import/export, and webhooks, and for integration tests.

- `products` (`catalog:write`): GET list, POST create, GET/PATCH/DELETE(archive) `{id}`, POST `{id}/duplicate`, POST `{id}/variants`, PATCH `variants/{vid}`, POST `images/sign` (upload signature), PATCH `{id}/images/order`, POST `import` (dry-run then commit), GET `export`. PATCH requires `If-Match: <__v>` → 409 on a stale update.
- `categories`, `collections` (`catalog:write`).
- `inventory` (`inventory:read/adjust`): GET list/low-stock, POST `{variantId}/adjust` `{delta | setTo, reason}` (reason required), GET `{variantId}/movements`.
- `orders` (`orders:read/update/cancel`): GET list (filters: date, status axes, q), GET `{id}`, POST `{id}/transition` `{event, note}` (validated against the state machine), POST `{id}/notes`, POST `{id}/cancel`, POST `{id}/invoice`.
- `payments` (`payments:read`): GET list, GET `{id}`, POST `{id}/reconcile`.
- `refunds`: POST (`refunds:create`; amounts above the configured limit require `refunds:approve_large`), GET list.
- `shipments` (`shipments:manage`): POST `/orders/{id}/shipments`, POST `{id}/label`, POST `{id}/pickup`, POST `{id}/cancel`, POST `{id}/sync`, POST `manifest`.
- `returns` (`returns:manage`): GET, POST `{id}/approve|reject|receive|inspect|refund`.
- `customers` (`customers:read/suspend`): GET list, GET `{id}`, POST `{id}/suspend|restore`, POST `{id}/notes`.
- `coupons`, `discounts`, `reviews/{id}/moderate`, `content` (banners, nav, pages), `seo` (defaults, redirects), `settings` (`settings:write`), `users` (`users:manage_roles`), `audit-logs` (`auditlogs:read`), `analytics/*` (`analytics:read`: `overview`, `sales`, `products`, `categories`, `customers`, `inventory`, `payments`, `shipping`).

## 8. Cron (`/api/cron/*`)

`jobs`, `reservations`, `reconcile-payments`, `sync-shipments`, `inventory-audit`, `rollup`, `cleanup`. All are bearer-protected and idempotent, and complete within the function time limit by processing bounded batches.

## 9. Contract tests (Phase by phase)

Each endpoint ships with: happy path, validation failures, unauthenticated, wrong role, wrong owner (404), rate-limit (where applicable), idempotent replay, and a schema-conformance check against its Zod response schema.

## 10. Implemented in Phase 3: public catalogue (all `GET`, no auth)

Every endpoint is served by `apiHandler` (`src/lib/api/handler.ts`) and returns `{ data, meta? }` or the error envelope above. Catalogue responses send `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` and an `X-Request-Id` header. Behind the CDN the data is also held in Next's cache (`catalog` profile: 1 min fresh, 5 min background refresh, 1 h expiry) with tags for admin invalidation.

| Path                                       | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/v1/products`                         | Query: `q`, `category`, `collection`, `minPrice`/`maxPrice` (whole rupees), `fabric`, `color`, `pattern` (repeatable), `availability=in_stock`, `sort` (`relevance` \| `newest` \| `price_asc` \| `price_desc` \| `popular`), `page` (1-500), `pageSize` (1-60, default 24). `data` is product cards. `meta` has `page, pageSize, total, totalPages, facets{fabric,color,pattern,price}` and, when filtering by one, `category` (with breadcrumbs and children) or `collection`. Unknown category or collection gives 404. |
| `/api/v1/products/suggest?q=`              | At least 2 characters. Up to 5 products and 3 categories by word prefix.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `/api/v1/products/{slug}`                  | Product with variants: effective price, struck-through price, unit, `availability` (status, wording, max orderable). Raw stock is never returned. Draft, archived and variant-less products are 404.                                                                                                                                                                                                                                                                                                                       |
| `/api/v1/products/{slug}/related`          | Same-category products, excluding itself.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `/api/v1/categories`, `/categories/{slug}` | Tree with children; detail with breadcrumbs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `/api/v1/collections/{slug}`               | 404 outside its visibility window.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `/api/v1/settings/public`                  | Store name, announcement, free-shipping threshold, whether tax is on.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

Behaviour decided in implementation:

- An invalid path parameter (for example a malformed slug) is a **404**, not 422, so it reveals nothing. Invalid query parameters are **422** with a `details` list of `{ path, issue }`.
- Database connectivity failures (connecting, or on an open connection) are **503** with `Retry-After: 5` and the generic message; anything else unexpected is **500**. Internal detail goes only to the logs, keyed by `requestId`.
- Exact SKU in `q` returns that product. Search syntax (quotes, leading minus) is treated as plain words.
- **Rate limiting is not applied yet.** It needs the Redis-backed limiter built in Phase 5; until then the CDN/cache layer is the only protection on these endpoints (tracked in `project-status.md`).

Added in Phase 4 to `GET /api/v1/products`: `flag` (`featured` | `bestseller` | `newArrival`), `onSale=true` (cheapest variant currently discounted) and `slugs` (repeatable, up to 50; used by the guest wishlist). An invalid slug in `slugs` is a 422 for the whole request.

## Phase 5 implementation notes

Auth and account flows are Server Actions (`src/features/auth`, `src/features/account`), not REST routes. HTTP endpoints added: `/api/auth/[...nextauth]` (Auth.js), `/api/cron/jobs` (bearer `CRON_SECRET`), `/api/dev/mailbox` (only when `ENABLE_DEV_PAGES=1`).
