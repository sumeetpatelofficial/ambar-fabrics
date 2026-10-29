# Deployment and Operations

Status: plan. Detailed runbooks are completed in Phase 14.

## 1. Environments

| Env              | Hosting           | Database                                                       | Payments               | Notes                          |
| ---------------- | ----------------- | -------------------------------------------------------------- | ---------------------- | ------------------------------ |
| Local            | `pnpm dev`        | Docker single-node replica set (`docker-compose.yml`)          | Razorpay **test** keys | console email, mock shipping   |
| Preview (per PR) | Vercel Preview    | separate Atlas DB `…_preview`                                  | Razorpay **test** keys | `noindex`, robots disallow-all |
| Production       | Vercel Production | Atlas dedicated cluster (M10+), region **Mumbai (ap-south-1)** | Razorpay **live**      |                                |

Never share a database or key set between Preview and Production. Production secrets are only scoped to the Production environment in Vercel.

## 2. Vercel

- Function region: Mumbai (`bom1`) to sit next to Atlas Mumbai and the Indian users. Verify availability in Phase 14.
- Node runtime for anything touching Mongoose, argon2, or crypto (not Edge). `proxy.ts` stays light (headers, redirects lookup, coarse auth redirect only).
- Mongoose connection is cached on `globalThis`, with `maxPoolSize` kept low (serverless) and `serverSelectionTimeoutMS` ~5 s. Use Atlas connection limits and keep `maxIdleTimeMS` short.
- **Crons** (`vercel.json`): minute-level jobs need a plan that supports them. Hobby allows daily crons only. Options: Vercel Pro, or an external scheduler (for example Upstash QStash) calling the same bearer-protected routes. Decision needed (A-14).
- Function duration: webhooks and crons process bounded batches within the plan's limit.
- Image optimization: Cloudinary does the heavy lifting (`f_auto,q_auto`, responsive widths) through a custom `next/image` loader, to avoid Vercel image-transformation cost.

## 3. MongoDB Atlas

- Production: dedicated cluster (M10 or higher), 3-node replica set, Mumbai, **continuous cloud backup with point-in-time restore**, encryption at rest (default), TLS, IP access list (Vercel does not provide static IPs on standard plans, so use a strong user + least-privilege DB user, Vercel's integration or Secure Compute and private networking if available, and document the trade-off).
- Users: `app_rw` (readWrite on the app DB only), `migrations` (separate, used from CI/local), no Atlas-admin credentials in the app.
- Monitoring alerts: connections, replication lag, slow queries (> 100 ms), disk, and failed logins.
- `scripts/create-indexes.ts` runs on deploy (idempotent). `autoIndex` is off in production.

## 4. Third-party setup checklist

| Service                                                   | Setup                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Domain/HTTPS**                                          | Domain on Vercel, `www`→apex (or reverse) redirect, HSTS after verifying all subdomains.                                                                                                                                                                                                                                                                       |
| **Google OAuth**                                          | Cloud project → OAuth consent screen (External; scopes `openid email profile`), publish out of "testing", authorized redirect URI `https://<domain>/api/auth/callback/google` (plus localhost and preview as separate dev clients; wildcard preview URLs are not allowed).                                                                                     |
| **Razorpay**                                              | Complete KYC for live mode. Create the webhook `https://<domain>/api/v1/webhooks/razorpay` with events `payment.authorized, payment.captured, payment.failed, order.paid, refund.created, refund.processed, refund.failed`. Set a webhook secret distinct from the API secret. Enable auto-capture. Confirm which payment methods the account is eligible for. |
| **Shiprocket**                                            | Create an API user (separate from the main login), add pickup location, fund the wallet, configure the webhook token.                                                                                                                                                                                                                                          |
| **Resend**                                                | Verify the sending domain (SPF, DKIM, DMARC with `p=none` then tighten); separate transactional from marketing; bounce/complaint webhook handled in Phase 12.                                                                                                                                                                                                  |
| **Cloudinary**                                            | Upload preset restricted to images, signed uploads, folder per env.                                                                                                                                                                                                                                                                                            |
| ~~Upstash Redis~~ (not used; rate limiting is in MongoDB) | Region Mumbai or Singapore; REST URL and token in env.                                                                                                                                                                                                                                                                                                         |
| **GA4 / Search Console**                                  | GA4 property + web stream; Search Console Domain property by DNS; link the two.                                                                                                                                                                                                                                                                                |
| **Sentry**                                                | Project per env; source-map upload in CI; PII scrubbing; alert rules (error spike, webhook failures, payment mismatch).                                                                                                                                                                                                                                        |

## 5. CI/CD

GitHub Actions on PR: install (frozen lockfile) → typecheck → lint → unit/integration tests (Mongo replica set service container) → build → Playwright e2e against a preview or local server → `pnpm audit`/OSV → gitleaks. Vercel creates the preview. Production deploys are made from `main` after CI passes. Database migrations run as a separate, explicit step before the release that needs them (expand → migrate → contract).

## 6. Monitoring and alerts

- Sentry errors and performance. Vercel Analytics or Speed Insights (RUM for Web Vitals).
- Uptime monitor on `/api/health` (checks DB ping + config sanity, no secrets) from an external service.
- Alert triggers: payment `captured` without a confirmed order for > 10 min, webhook failure rate, dead-letter jobs, reservation invariant violations, 5xx spike, low-stock digest, and cron heartbeat missing.

## 7. Backup and recovery

- RPO target ≤ 5 min and RTO ≤ 4 h via Atlas PITR (confirm with the chosen tier).
- Quarterly restore drill into a scratch cluster, with a documented procedure and a checklist to validate (order counts, latest payments, stock invariants).
- Also keep a weekly logical export of `orders`, `payments`, `refunds`, `invoices` to storage owned by the business (financial records outlive the database vendor).
- After any restore: run payment reconciliation against Razorpay and the inventory audit before re-enabling checkout.

## 8. Release and rollback

- Instant rollback with Vercel "Promote previous deployment". Schema changes are backward compatible for one release (expand/contract), so a rollback never meets an incompatible database.
- Feature flags (`SiteSettings.featureFlags`) for risky features (COD, new shipping provider).
- Maintenance mode flag that blocks new checkouts but still serves the catalog and processes webhooks.

## 9. Production smoke test (after every release)

Home, a category, a product, search; register → verify email → login; add a fabric length to cart; quote shipping; ₹1 test purchase with live keys (refund immediately); webhook receipt visible in admin; admin login; sitemap and robots are reachable.

## 10. Launch checklist (abridged, full list in Phase 14)

All secrets rotated from test; live Razorpay webhook verified; GST/invoice settings signed off by the accountant; policy pages reviewed by the owner; Search Console verified and sitemap submitted; GA4 DebugView check; backups verified; admin 2FA on; Sentry alerts routed; rate limiting on Upstash; CSP enforced; robots allow-all on production only.

## Authentication setup (Phase 5)

- `AUTH_SECRET` (32+ characters), `CRON_SECRET` (16+), `AUTH_URL` (the public site URL) in Vercel env.
- Google sign-in (optional): create an OAuth client; authorised redirect URI `<site>/api/auth/callback/google`; set `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`.
- Email: `RESEND_API_KEY` and `EMAIL_FROM` on a verified domain. Production refuses the console provider.
- Cron: call `/api/cron/jobs` with `Authorization: Bearer $CRON_SECRET` to send queued emails.
- First admin: `pnpm admin:create` (dry run), then with `--yes`.
- Run `pnpm db:indexes` against Atlas to create indexes for the new collections.

## Payments setup (Phase 7)

- Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` and `NEXT_PUBLIC_RAZORPAY_KEY_ID` (test keys first). Without them production refuses to take payments; development uses a stand-in gateway.
- In the Razorpay dashboard add a webhook to `<site>/api/webhooks/razorpay` with the same secret and events `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`, `refund.failed`. Keep auto-capture on.
- The cron on `/api/cron/jobs` should run every minute (Vercel Pro or an external scheduler): it expires unpaid orders, releases stock and sends emails.
- Run `pnpm db:indexes` for the new collections (Order, Payment, Refund, Coupon, CouponRedemption, Counter, WebhookEvent).

## Shipping setup (Phase 8)

- In Shiprocket create the pickup location, then set `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD` (an API user), `SHIPROCKET_PICKUP_LOCATION` (its exact name), `SHIPPING_ORIGIN_PINCODE` and `SHIPROCKET_WEBHOOK_TOKEN` (any 16+ character secret).
- In Shiprocket's webhook settings use `<site>/api/webhooks/shiprocket` with the same token as the `x-api-key` header.
- The cron on `/api/cron/jobs` also syncs tracking and closes return windows.
- Run `pnpm db:indexes` for Shipment and ReturnRequest.

## SEO, content and photos (Phase 10)

- Cloudinary: create an account, then set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET`. Product photographs then upload from the admin. Photos are served from `res.cloudinary.com` (already allowed in `next.config.ts`).
- Before launch: read and edit every page under Admin, Pages; set the shop email, phone and address under Admin, Settings (the contact form appears once the email is set); have the privacy policy and terms reviewed by a lawyer.
- `robots.txt` allows search engines only when `NEXT_PUBLIC_APP_URL` is your real https domain and the site runs in production. Submit `<site>/sitemap.xml` in Google Search Console after launch.
- Run `pnpm db:indexes` for Review and ContentPage.
- Run `pnpm db:indexes --yes` for Taxon, then `pnpm db:link-taxa --yes` to create master fabrics/prints from existing products.
- Phase 11: run `pnpm db:indexes --yes` again (new Order indexes for reports). To switch on analytics, create a GA4 property and set `NEXT_PUBLIC_GA_MEASUREMENT_ID` (see `docs/analytics.md`); leave it unset to have no banner and no tracking. Re-read the privacy policy page text (it now mentions optional analytics cookies; stored pages keep their old text until edited under Admin, Pages).
