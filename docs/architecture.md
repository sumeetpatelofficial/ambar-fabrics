# Architecture

Status: **Phase 0 proposal — awaiting approval.** Nothing below is implemented yet.

## 1. Repository state

`/Users/sumeet/projects/Ambar Fabrics` is empty and not a git repository. This is a greenfield project. Phase 1 will run `git init`.
Toolchain on the dev machine: Node 24.14.1, npm 11.11.0, pnpm available, git available.

## 2. System shape

A single Next.js (App Router) application deployed on Vercel. No separate backend.

```
Browser ──► Next.js (Vercel)
             ├─ Server Components  (storefront reads, cached + tagged)
             ├─ Route Handlers /api/v1/*  (public REST, webhooks, admin API)
             ├─ Server Actions     (own-UI mutations: profile, address, wishlist)
             └─ Cron routes        (/api/cron/*, Vercel Cron, secret-protected)
                    │
   services/  ◄─────┘   business rules, state machines, pricing, authorization
   repositories/        the ONLY layer that touches Mongoose
   lib/{payments,shipping,email,storage}  provider adapters behind interfaces
                    │
        MongoDB Atlas (replica set)   Razorpay   Shiprocket   Resend   Cloudinary
                                       Upstash Redis (rate limits)   Sentry   GA4
```

Layering rule (enforced by review and an ESLint `no-restricted-imports` rule in Phase 1):
`app/ & components/` → `features/*` / `services/` → `repositories/` → `models/`. UI never imports models. Providers are only reached via `lib/<provider>/` interfaces.

Every mutation, whether Route Handler or Server Action, calls the same service function. The service performs authorization, so a Server Action cannot bypass it.

## 3. Version decisions (verified against the npm registry on 2026-10-13)

| Package                        | Version                   | Note                                                                                                                                                                |
| ------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| next                           | 16.4.0                    | Verified in Phase 1: `middleware.ts` is now `proxy.ts`; Cache Components and Partial Prefetching are on by default; error boundaries receive `retry` (not `reset`). |
| react                          | 19.3.0                    |                                                                                                                                                                     |
| tailwindcss                    | 4.3.3                     | CSS-first config; design tokens as CSS variables                                                                                                                    |
| mongoose                       | 9.11.2                    | bundles `mongodb ~7.7`                                                                                                                                              |
| next-auth (Auth.js v5)         | 5.0.0-beta.32             | v5 is still a beta; see D-1                                                                                                                                         |
| zod                            | 4.6.7                     |                                                                                                                                                                     |
| motion                         | 14.2.0                    | import from `motion/react`                                                                                                                                          |
| zustand / TanStack Query / RHF | 5.0.15 / 5.104.2 / 7.90.0 |                                                                                                                                                                     |
| razorpay (Node SDK)            | 2.9.8                     |                                                                                                                                                                     |
| @node-rs/argon2                | 2.2.2                     | prebuilt binaries, works on Vercel                                                                                                                                  |
| resend                         | 6.32.1                    |                                                                                                                                                                     |
| vitest / playwright            | 5.0.4 / 1.64.0            |                                                                                                                                                                     |
| @sentry/nextjs                 | 11.7.0                    |                                                                                                                                                                     |

Pin exact versions with `pnpm` and a committed lockfile. Phase 1 re-verifies each against its changelog before install.

## 4. Key architectural decisions

**D-1 Auth.js without the MongoDB adapter (JWT sessions).**
`@auth/mongodb-adapter@3.11.3` declares peer `mongodb@^6`. Mongoose 9 ships `mongodb ~7.7`. Installing both gives two driver versions or a peer conflict. Credentials login in Auth.js requires JWT sessions anyway. So we use Auth.js v5 with no adapter. Our own `User` and `Account` (linked identities) collections are written through Mongoose in the `signIn` and `jwt` callbacks. The alternatives are pinning Mongoose 8 (which uses mongodb 6) or using Better Auth. I recommend the plan above. If you prefer a non-beta library, say so before Phase 5.

**D-2 JWT sessions with server-side revocation hooks.**
Short-lived JWT (`maxAge` 7 days, `updateAge` 1 day). The token holds `userId` and `sessionVersion` only. Role, status, and permissions are never trusted from the token. The admin guard and every sensitive service call re-read the user from MongoDB (`status`, `role`, `sessionVersion`). Password change, suspension, or "log out everywhere" increments `sessionVersion`, which invalidates all JWTs.

**D-3 Argon2id via `@node-rs/argon2`.** OWASP parameters (m=19 MiB, t=2, p=1 minimum), tuned in Phase 5.

**D-4 Money is integer paise; quantities are integers in a base unit.** See `inventory-and-measurements.md`. No floats anywhere in pricing.

**D-5 Single price engine.** One pure function `priceCart(input, catalogSnapshot, settings, coupon, shippingQuote)` in `features/checkout/pricing`. It is used by cart display, checkout, order creation, and invoice. Nothing else computes totals.

**D-6 Mongo transactions only where unavoidable.**
Atlas is a replica set, so transactions work. Stock changes are single-document atomic updates with a guard (`$inc` with `available >= qty` in the filter). Order and reservation creation is a multi-document operation, so it uses a transaction. Local development uses a single-node replica set (docker-compose or `mongodb-memory-server` with `replSet`).

**D-7 Reliable async work = Mongo outbox + Vercel Cron.**
A `Job` collection (type, payload, `runAt`, attempts, `lockedUntil`, `dedupeKey`) holds emails, shipment sync, and reconciliation. A cron route drains it every minute with claim-by-`findOneAndUpdate`. Webhook handlers write state and enqueue jobs, then return 200 quickly. No external queue until measured need. (`Job` is added to the entity list in `database-design.md`.)

**D-8 Rate limiting in MongoDB (implemented in Phase 5; replaces the Upstash plan).** A fixed-window counter per key with a TTL index, updated atomically, so it works across serverless instances without another service. Revisit Redis only if traffic makes the extra database writes a cost problem.

**D-9 Caching (verified in Phase 1).** `cacheComponents: true` is enabled. Catalog reads use `'use cache'` with `cacheLife`/`cacheTag`; admin mutations revalidate tags. Anything time-dependent or request-specific (`new Date()`, `cookies()`, `headers()`, `searchParams`, DB reads that must be live) must sit inside a cached function or behind `<Suspense>`/`connection()`; otherwise the build fails. That caught a bare `new Date()` in the footer during Phase 1. Cart, checkout, account, and admin are always dynamic, and their data sits behind `<Suspense>`.

**D-10 Provider adapters.** `PaymentProvider`, `ShippingProvider`, `EmailProvider`, `ImageStorage` interfaces. Real adapters (Razorpay, Shiprocket, Resend, Cloudinary) plus dev adapters (`MockShipping`, `ConsoleEmail`). The factory picks the adapter from env. In production, a missing required config makes the operation fail closed (no mock fallback, no payments).

**D-11 Config over constants.** Store name, address, GSTIN, tax mode, shipping rules, policies, and free-shipping threshold live in a `SiteSettings` document, edited at `/admin/settings` and cached by tag. Seed script supplies neutral defaults.

## 5. Folder structure

Follows the brief, with these refinements. Folders are created only when first used.

```
src/
  app/
    (store)/            storefront pages
    (auth)/             login, register, verify-email, forgot/reset
    (account)/account/  customer area (server-guarded layout)
    admin/              admin (server-guarded layout, permission-checked per page)
    api/v1/...          REST handlers
    api/auth/[...nextauth]/  Auth.js
    api/cron/...        cron drains
    sitemap.ts robots.ts
  components/ui|layout|storefront|products|cart|checkout|account|admin
  features/<domain>/    components + server actions + hooks + zod schemas per domain
  services/             domain services (orderService, inventoryService, ...)
  repositories/         Mongoose access
  models/               Mongoose schemas
  lib/                  env, db, auth, security (rate-limit, csrf-origin, sanitize),
                        logger, money, measure, payments, shipping, email, storage, analytics
  config/               nav, constants, permissions matrix
  stores/               zustand (cart UI only)
tests/ unit | integration | e2e
scripts/ seed, create-indexes, create-super-admin
docs/
```

`src/schemas` and `src/utils` from the brief are folded into `features/*/schemas.ts` and `lib/*` to avoid dumping grounds.

## 6. Authentication and Google OAuth flow

Providers: Google (OIDC) and Credentials (email + password).

**Register (email/password):** Zod validation → rate limit (IP + email) → create `User` (`emailVerified=null`, argon2id hash) → create `EmailVerificationToken` (random 32 bytes, stored as SHA-256 hash, 24 h TTL, single use) → enqueue email. Login is blocked until verified. Responses are enumeration-safe ("if the address is new, we sent an email").

**Google sign-in:**

1. Auth.js redirects to Google with PKCE and `state`.
2. Callback: `signIn` callback receives the profile. We require `email_verified === true`, else deny.
3. Look up `Account{provider:'google', providerAccountId: sub}`. If found, sign in that user (check `status`).
4. Not found, but a `User` with the same email exists:
   - If the existing user's email is verified: link. Google verified the same email, so both prove control of the mailbox. Create `Account`, log an audit event, and send a "Google was linked to your account" notice to the user.
   - If the existing user's email is **unverified**: do **not** link. This prevents pre-registration takeover (an attacker registers victim@x.com with a password, victim later uses Google, and the attacker still holds the password). Instead, delete the unverified password credential, adopt the Google identity, and set `emailVerified`. The attacker's password no longer works.
5. No user: create `User` (no `passwordHash`, `emailVerified` from Google) plus `Account`.
6. `jwt` callback stores `userId` and `sessionVersion`.

Users without a password see "Set a password" (needs a fresh Google re-auth or an emailed link), not "current password" (`/account/security`).

**Reset password:** token flow as above (1 h TTL, single use, hashed). On success it bumps `sessionVersion` and sends a "password changed" notice.

## 7. Admin permission model

Role → permission set is defined in `config/permissions.ts` (a typed matrix). See `security.md` §Authorization for the matrix. Every service function begins with `assertPermission(actor, 'orders:refund')`. Route Handlers, Server Actions, and admin pages (layout + page) all call into this. Hidden navigation is cosmetic only.

## 8. Razorpay and webhook flow (summary)

Full detail in `order-lifecycle.md`.

1. `POST /api/v1/checkout` — server re-prices the cart, validates stock and serviceability, **reserves stock**, creates `Order(status=pending_payment)`, then creates the Razorpay order (`receipt = orderNumber`, amount in paise, `Idempotency` via our `idempotencyKey`) and a `Payment(status=created)`.
2. Browser opens Razorpay Checkout with the `razorpay_order_id`.
3. On the browser callback → `POST /api/v1/payments/razorpay/verify`: HMAC-SHA256(`order_id|payment_id`, key_secret) with timing-safe compare, then **fetch the payment from Razorpay** and confirm amount, currency, order, and status `captured`/`authorized`. This only provides fast UX; it uses the same idempotent `markPaymentCaptured()` as the webhook.
4. `POST /api/v1/webhooks/razorpay` — read the **raw body** (`request.text()`), verify `X-Razorpay-Signature`, insert `WebhookEvent` keyed by `X-Razorpay-Event-Id` (unique index; duplicate → 200 no-op), dispatch by event type to the idempotent state transitions, return 200.
5. Reconciliation cron fetches Razorpay orders/payments for `pending_payment` orders older than N minutes and for unmatched webhooks.
6. Success pages read order state from the DB. A redirect alone never marks an order paid.

## 9. Environment variables

Validated with Zod in `lib/env` (server schema and public schema separated; build fails on invalid public vars).

| Var                                                                    | Required     | Notes                                                                             |
| ---------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`                                                  | yes          | canonical origin                                                                  |
| `MONGODB_URI`                                                          | yes          | Atlas SRV, replica set                                                            |
| `AUTH_SECRET`                                                          | yes          | ≥32 bytes                                                                         |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`                                 | prod         | Google sign-in disabled if absent in dev                                          |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`    | for payments | `NEXT_PUBLIC_RAZORPAY_KEY_ID` is the only public one (key id is public by design) |
| `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`                              | optional     | mock adapter if absent in dev                                                     |
| `RESEND_API_KEY`, `EMAIL_FROM`                                         | prod         | console adapter in dev                                                            |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | for uploads  |                                                                                   |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`                   | prod         | rate limiting                                                                     |
| `CRON_SECRET`                                                          | prod         | Vercel Cron bearer                                                                |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID`                                        | optional     | consent-gated                                                                     |
| `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`                                      | optional     |                                                                                   |
| `PII_ENCRYPTION_KEY`                                                   | optional     | only if we encrypt stored provider credentials (decide in Phase 9)                |

## 10. External accounts needed (by phase)

| Phase | Account                                                                                                   |
| ----- | --------------------------------------------------------------------------------------------------------- |
| 1     | MongoDB Atlas (free M0 is enough to start; M10+ for production backups), GitHub, Vercel                   |
| 5     | Google Cloud project with OAuth consent screen and client; Resend (or other email) with a verified domain |
| 3/9   | Cloudinary                                                                                                |
| 6     | Upstash Redis                                                                                             |
| 7     | Razorpay (test mode now; live needs KYC and business verification)                                        |
| 8     | Shiprocket (needs a pickup address and wallet balance)                                                    |
| 11    | GA4 property, Search Console                                                                              |
| 13/14 | Sentry, domain registrar and DNS                                                                          |

## 11. Risks

1. Auth.js v5 is a long-running beta (D-1). Mitigation: isolate behind `lib/auth` so it can be swapped.
2. Next 16 and Mongoose 9 are new majors. Mitigation: pin and read release notes in Phase 1; run integration tests against real Mongo.
3. Local transactions need a replica set. Mitigation: docker-compose file in Phase 1.
4. Razorpay Standard Checkout does not guarantee a webhook arrives first. Mitigation: verify endpoint + webhook + reconciliation all converge on one idempotent function.
5. Shiprocket API stability and token expiry (10 days). Mitigation: adapter caches the token and re-logins on 401.
6. Tax correctness (GST) is a business/legal decision. Mitigation: configurable, with an accountant review gate before launch.

## 11. Rendering decisions learned in Phase 4

- **Data sections render per request, never at build.** Components that read the catalogue call `await connection()` first and sit inside `<Suspense>`, so `next build` never touches a database (verified: the build passes with `MONGODB_URI` empty). The data itself still comes from `use cache` entries (`services/catalog-cache.ts`, profile `catalog`, tagged for admin invalidation).
- **Dynamic-param pages use the shell + Suspense pattern** (`params` is awaited inside `<Suspense>`), with the proxy supplying the real 404 status (see `seo-strategy.md` §10).
- **Fonts are self-hosted** (`src/app/fonts`, OFL texts included): no network at build, no requests to Google.
- **Browser tests are self-contained:** `scripts/e2e-server.ts` starts an in-memory MongoDB, seeds it, builds and serves the app on port 3100, whatever `.env.local` says.

## 11a. Design system (built in Phase 2)

- **Palette (CSS variables in `app/globals.css`, mapped to Tailwind `@theme`):** paper `#fbf9f4` (background), ink `#23211d` (text), sage `#4b5e45` (primary), linen `#eee8da` (secondary surfaces), madder `#9a4431` (sale and emphasis, used sparingly), brass `#876823` (ratings, small badges). `tests/unit/contrast.test.ts` fails the build if any text, control-edge or focus-ring pair drops below WCAG 4.5:1 (text) or 3:1 (UI). No dark theme in v1.
- **Type:** Gilda Display (one-weight classical serif) for headings only; Hanken Grotesk for interface and body. Tabular figures for prices. Sentence-case labels; no all-caps eyebrows or numbered chrome.
- **Shape and depth:** 4 px radii, 1 px hairlines, no card shadows. Overlays use one soft shadow.
- **Signature element:** the _selvedge rule_ (`.selvedge`, `<Selvedge />`), a hairline with measuring-tape ticks, because the store sells fabric by the metre. Used at the top of the footer and as a divider; it becomes the length selector's scale in Phase 4.
- **Components:** shadcn/ui (`base-nova`, built on **Base UI**, not Radix) in `components/ui`, with touch-friendly sizes (buttons 40 px, large 48 px). Storefront components in `components/storefront`: `ProductCard`, `PriceTag` (always shows the selling unit), `CardMedia`, `WishlistButton`, `ProductCardSkeleton`/`ProductGridSkeleton`, `EmptyState`, `ErrorState`, `Breadcrumbs`, `ConfirmDialog`, `FabricPlaceholder` (woven/printed stand-in artwork), `Selvedge`. Layout components in `components/layout`.
- **Navigation is data:** `config/navigation.ts` feeds the desktop mega menu, the mobile drawer and the footer. From Phase 3 it comes from the category tree and SiteSettings.
- **Motion:** Motion (`motion/react`) only where it answers an action: the product-card image swap on hover/focus and the wishlist tap. Menus, drawers, dialogs and search use Base UI's CSS transitions. `MotionConfig reducedMotion="user"` plus a global `prefers-reduced-motion` rule disable animation for those who opt out. There are no scroll-reveal or page-load effects.
- **Accessibility rules learned in Phase 2:** never render a link through Base UI's `Button`/`Close` with `nativeButton={false}`, because it adds `role="button"` to the anchor; use `<Link className={buttonVariants(...)}>` and close overlays through state. Base UI's focus-guard spans are excluded from axe scans as an intentional library pattern.
- **Preview page:** `/dev/components` shows every block with sample data. It returns 404 in production and is `noindex`.

## 12. Assumptions requiring your approval

See the numbered list **A-1 to A-14** at the end of `implementation-roadmap.md`.
