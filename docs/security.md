# Security

## 1. Threat model (top risks for this store)

1. Price/quantity tampering and overselling → server-side pricing engine, atomic stock.
2. Payment spoofing (fake "success" redirect, forged webhook, replay) → signature checks, fetch-from-provider, idempotency.
3. Account takeover (credential stuffing, pre-registration OAuth takeover, reset-token theft) → rate limits, lockout, hashed single-use tokens, safe linking.
4. Broken access control (IDOR on orders/addresses, admin reachable by URL) → ownership-scoped queries, server permission checks.
5. Injection (NoSQL operators, XSS from rich-text/reviews, CSV injection on export) → Zod + `sanitizeFilter`, sanitized content, CSV escaping.
6. Secrets leakage and PII in logs/analytics.
7. Abuse (coupon brute force, order-tracking enumeration, search scraping, review spam).

## 2. Authentication controls

- Argon2id (`@node-rs/argon2`), per-user salt automatic, parameters in config; rehash-on-login when parameters are raised.
- Password policy: ≥ 10 chars, max 128, checked against a common-password list (zxcvbn-lite or k-anonymity HIBP check; HIBP is optional and fails open).
- Login throttling: per-IP and per-email fixed windows kept in MongoDB (5 attempts per 15 minutes); account `failedLoginCount` with exponential `lockedUntil` after 5 failures (generic error text; timing-equalized by always hashing).
- Email verification required before password login.
- Reset and verification tokens: 32 random bytes, stored as SHA-256, TTL, single use, previous tokens invalidated; reset bumps `sessionVersion` and sends a notice email.
- Cookies: Auth.js defaults (`HttpOnly`, `Secure`, `SameSite=Lax`, `__Secure-`/`__Host-` prefixes in prod).
- OAuth: PKCE + state (Auth.js), `email_verified` required, linking rules in `architecture.md` §6.
- Admin accounts: step-up (re-enter password) for destructive/financial actions; optional TOTP 2FA for admin roles is **recommended before launch** (Phase 13 candidate, A-14).
- `/account/security`: change password (current password required if one exists), active-session invalidation ("sign out everywhere" = bump `sessionVersion`).

## 3. Authorization

Server-enforced. Every service function begins with an assertion:

```ts
assertPermission(actor, "orders:refund") // role → permission table
assertOwnership(actor, resource.userId) // customer data
```

Customer queries are always `{ _id, userId: session.userId }`. A miss returns **404**, not 403, to avoid revealing existence. The admin layout checks session + DB role + status on every request, and each admin page and API route checks its own permission as well (defence in depth; navigation filtering is cosmetic).

### Permission matrix (`config/permissions.ts`)

| Permission                                                      |    Support     | Catalog | Fulfillment | Admin | Super |
| --------------------------------------------------------------- | :------------: | :-----: | :---------: | :---: | :---: |
| `catalog:read`                                                  |       ✔        |    ✔    |      ✔      |   ✔   |   ✔   |
| `catalog:write` (products, categories, collections, SEO, media) |                |    ✔    |             |   ✔   |   ✔   |
| `inventory:read`                                                |       ✔        |    ✔    |      ✔      |   ✔   |   ✔   |
| `inventory:adjust`                                              |                |    ✔    |      ✔      |   ✔   |   ✔   |
| `orders:read`                                                   |       ✔        |         |      ✔      |   ✔   |   ✔   |
| `orders:update` (notes, status through valid transitions)       | ✔ (notes only) |         |      ✔      |   ✔   |   ✔   |
| `orders:cancel`                                                 |       ✔        |         |      ✔      |   ✔   |   ✔   |
| `shipments:manage`                                              |                |         |      ✔      |   ✔   |   ✔   |
| `returns:manage`                                                |       ✔        |         |      ✔      |   ✔   |   ✔   |
| `refunds:create` (≤ configured limit)                           |                |         |             |   ✔   |   ✔   |
| `refunds:approve_large`                                         |                |         |             |       |   ✔   |
| `payments:read`                                                 |                |         |             |   ✔   |   ✔   |
| `customers:read`                                                |       ✔        |         |             |   ✔   |   ✔   |
| `customers:suspend`                                             |                |         |             |   ✔   |   ✔   |
| `coupons:manage`, `reviews:moderate`, `content:write`           |    reviews     | content |             |   ✔   |   ✔   |
| `analytics:read` (sales/finance)                                |                |         |  ops only   |   ✔   |   ✔   |
| `settings:write` (store, tax, shipping rules)                   |                |         |             |   ✔   |   ✔   |
| `users:manage_roles`                                            |                |         |             |       |   ✔   |
| `auditlogs:read`                                                |                |         |             |   ✔   |   ✔   |

Protections: the last active `super_admin` cannot be demoted, suspended, or deleted (checked in a transaction). Admins cannot grant a role above their own. Role changes are audited and bump the target's `sessionVersion`.

## 4. Request-level protections

- **Validation:** every handler parses params, query, and body with Zod (`.strict()`), with max lengths and array sizes. Unknown fields rejected.
- **NoSQL injection:** Mongoose `sanitizeFilter`; filter values are parsed to primitives by Zod before queries; no raw `$where`/`$function`; search input escaped for regex use or uses the `$text` operator.
- **CSRF:** Route Handlers mutating state require `Content-Type: application/json` (no form-encoded cross-site posts) **and** an `Origin`/`Sec-Fetch-Site` check against `NEXT_PUBLIC_APP_URL` (implemented in a shared `withApi()` wrapper). Server Actions rely on Next's built-in Origin checking, with `allowedOrigins` set explicitly. Webhooks and cron routes are exempt from the origin check and use signature or secret instead. Cookies are `SameSite=Lax`.
- **Body limits:** 100 KB default for JSON APIs; webhooks 1 MB; uploads via direct signed upload to Cloudinary (type and size constrained in the signature: images only, ≤ 8 MB, allowed formats jpg/png/webp/avif), with the server verifying the resulting asset. SVG uploads are disallowed.
- **Security headers (`next.config`/`proxy.ts`):** CSP with nonces (scripts: self, nonce, Razorpay `checkout.razorpay.com`, GA when consented; frames: `api.razorpay.com`; img: self, Cloudinary, data/blob), `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `frame-ancestors 'none'`, COOP. CSP is run in report-only first, then enforced.
- **Rate limits** (Upstash sliding window; keys by IP + user where known):

| Endpoint class                                  | Limit                              |
| ----------------------------------------------- | ---------------------------------- |
| login / register / forgot / resend verification | 5 per 15 min per IP+email          |
| coupon validate                                 | 10 per min per user/IP             |
| track-order                                     | 10 per 15 min per IP               |
| search/suggest                                  | 60 per min per IP                  |
| checkout create / payment verify                | 20 per 10 min per user             |
| public catalog reads                            | 300 per min per IP (and CDN cache) |
| admin mutations                                 | 120 per min per user               |

429 responses carry `Retry-After`. When Upstash is unreachable, auth endpoints fail closed and catalog reads fail open.

- **Output safety:** React escaping by default. Rich text (product descriptions, policies) is sanitized on write and again on render (allow-list sanitizer); reviews are plain text. JSON-LD is serialized with `<` escaped. No `dangerouslySetInnerHTML` except through the one sanitized component (lint rule).
- **CSV import/export:** cells beginning with `= + - @` are prefixed with `'` on export; imports are validated row by row with a dry-run preview and size caps.
- **SSRF:** server never fetches user-supplied URLs (images are uploaded, not linked).
- **Errors:** one error envelope (see `api-contracts.md`). Unknown errors are logged with a `requestId` and return a generic 500. Never leak stack traces or Mongo error text.

## 5. Payments, webhooks, and inventory integrity

See `order-lifecycle.md`. Summary of controls:

- Amount from the DB order only. Currency fixed to INR.
- Verify signature using `timingSafeEqual`, then fetch from Razorpay, then compare amount, currency, and order id.
- Webhook raw-body signature check, `eventId` dedupe, quick 200, convergent handlers, reconciliation cron.
- Refund total guard, refund idempotency through `Refund._id` as a reference.
- No card data is stored or logged. Only the method label, last4 and network when returned by Razorpay.
- Razorpay Checkout runs in Razorpay's own iframe or hosted flow. We never touch card fields (PCI SAQ-A scope).

## 6. Secrets and configuration

- Only `NEXT_PUBLIC_*` vars reach the browser. `lib/env/server.ts` is `import 'server-only'`.
- Secrets live in Vercel encrypted env vars (separate per environment: Development, Preview, Production). **Preview deployments must use test-mode Razorpay keys and a separate Atlas database.**
- `.env.example` has placeholders only. `.gitignore` covers `.env*` (except the example). `gitleaks` runs in CI and as a pre-commit hook.
- Rotate on suspicion. Document the rotation steps in `deployment.md`.

## 7. Logging, privacy, and analytics

- Structured JSON logger (pino) with redaction paths (`password`, `token`, `authorization`, `razorpay_signature`, `phone`, `email` masked, `address`) and a `requestId` on every line.
- Sentry `beforeSend` scrubs request bodies, cookies, and headers; replay disabled for checkout and account pages.
- GA4 loads only after consent (Consent Mode v2 defaults denied). Events carry product ids, names, values, and currency, never email, phone, addresses, or order notes.
- DPDP Act (India) readiness: consent record for marketing, data-export and delete-request flow, retention schedule, privacy policy that matches actual processing. The legal review is the owner's responsibility (A-12).

## 8. Dependency and supply-chain hygiene

`pnpm audit` and `osv-scanner` in CI, Renovate or Dependabot, lockfile committed, `pnpm install --frozen-lockfile` in CI, `ignore-scripts` for new packages unless approved, minimal dependencies.

## 9. Audit logging

Written through `auditService.record()` for: login anomalies, role/permission changes, user suspension, settings, tax/shipping rules, product price and stock edits, coupon changes, order status overrides, notes, refunds, cancellations, return decisions, data exports, and failed authorization attempts on admin routes. Entries are append-only, with diffs redacted.

## 10. Backups and recovery (details in `deployment.md`)

Atlas continuous backup (M10+) with point-in-time restore; a documented and rehearsed restore drill; retention for orders and invoices as per A-12.

## 11. Pre-launch security verification (Phase 13 gate)

- Authz test suite: every admin route × every role × expected status (generated from the permission matrix).
- IDOR tests for orders, addresses, wishlist, returns, and invoices.
- Webhook tests: bad signature, replay, out-of-order, duplicate, partial failure and retry.
- Concurrency tests for stock and coupons.
- ZAP baseline scan on a preview deployment, CSP enforcement check, dependency audit clean for high/critical.
