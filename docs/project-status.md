# Project Status

**Last updated:** 2026-10-14
**Current phase:** Phase 10 — SEO, content, reviews and photo upload (built and tested; **awaiting approval**)
**Next recommended task:** Phase 11 — Analytics and reports (GA4 events, sales and stock reports), or Phase 12 scheduled jobs; confirm order with the owner.

## Phase 0 (approved 2026-10-13)

Nine blueprint documents in `docs/`. Owner answers recorded in `implementation-roadmap.md` §5
(GST not yet registered so tax is disabled by default, cut fabric non-returnable, about 200 products,
no Razorpay or Shiprocket accounts yet, domain purchased).

## Admin redesign (after Phase 10, 2026-10-15)

- The admin is its own app: sidebar with icons and grouped sections, top bar (where you are, "View shop", a bell listing what is waiting, your initial), user card with sign-out, a phone menu drawer. The shop's header, footer and announcement bar no longer appear in it (the shop's frame moved to `app/(site)/layout.tsx`; the root layout is only html, body and providers).
- New Overview: a period switch (today, 7, 30, 90 days), what is waiting (orders to ship, returns, orders needing a look, reviews), figures compared with the period before (sales, orders, new customers, average order), a daily sales chart (plain SVG with a text table for screen readers), stock alerts, recent orders, customer segments (new, returning, loyal by number of orders) and top products. Each block appears only for roles allowed to see it.
- Fixes found on the way: promoting an existing account with `pnpm admin:create` no longer changes its password (an earlier version did); a guest bag merged at sign-in is now sent under a one-time id, so it is applied once and no longer lost or doubled if the page changes mid-request.
- Verification: 655 unit and integration tests and 144 browser tests passed (including: no shop header, footer or announcement in the admin, phone menu, sign-out, per-role overview contents, period maths, refunds subtracted, segments). Not done: dark theme, a date picker for custom periods, a conversion rate (no visitor analytics until Phase 11).

## Product entry, purchase price, profit and invoices (2026-10-15)

- **New product in one step:** the form now takes the product and its colours together. Each colour block has a colour picker (21 common fabric colours, any colour, or a code), selling price, **purchase price**, **quantity in stock** (metres or pieces, by how the product is sold) and, under "More options", size, code, original and sale prices, weight. "Add another colour" adds a block. Everything is checked before anything is saved; if a later step fails the half-made product is removed. Codes are made for you when left blank (product, then colour).
- **Profit as you type:** profit per metre or piece and margin, and for the whole quantity entered: cost, selling value and profit; a warning when you would lose money.
- **Purchase price is private:** a new permission, `costs:read`, held by admin and super admin only. Other staff do not see it in forms, it is removed from what the service returns to them, they cannot overwrite it by editing, and it is never in the shop's data. Each order line remembers what the goods cost when sold, so later cost changes do not rewrite history. The overview shows **Estimated profit** (admins only), with a note of how much of the sales it covers when some goods have no purchase price.
- **Customer invoices:** numbered when an order is paid, `INV/2026-27/000001`, with a separate gapless sequence for each financial year (April to March), assigned in one transaction (tested with 12 orders paid at once). While the shop is not GST-registered it is a **Bill of Supply** with no GST; entering a GSTIN and switching GST on in Settings makes it a **Tax Invoice**. It shows the seller, buyer, items, discount, shipping, total, amount in words and payment reference, prints cleanly (Print or save as PDF), and is available to the buyer on their order and to staff on the order. Settings gained "Business name for invoices" and GSTIN.
- **Not built:** a downloadable PDF file made on the server (the browser's Save as PDF is used), credit notes for refunds and cancellations, the CGST/SGST/IGST split on a Tax Invoice, supplier purchase bills, and cost tracking per stock batch.
- Fixed on the way: the category chosen in the product form was lost after an error; clearing a Settings box did not clear the stored value; an accessibility scan could measure a button mid-fade and report a false contrast failure.

## Admin refinements (2026-10-15)

- **Finding your way:** every admin page has a breadcrumb trail and a Back button to the page above (for example Categories, Fabrics, Cotton: Back from Cotton goes to Fabrics, Back from Fabrics goes to Categories).
- **Products** are a grid of image cards (photo or fabric artwork, status badge, category, variants, price, out-of-stock tag), 20 to a page. **Pagination** (numbered, keeps the search and filters, shows "Showing 1 to 20 of N") on products, orders (now a table), customers, inventory, coupons, reviews and the audit log.
- **Overview in colour, with Recharts:** tinted figure tiles (green, blue, violet, amber), a blue area chart for daily sales with hover details, a green, blue and amber ring for customer segments, a sparkline of this month's sales in the sidebar, product thumbnails in inventory alerts, coloured initials and status badges. Charts are hidden from screen readers and followed by a table of the same figures; tints are paired with dark text for contrast.
- Verification: 660 unit and integration tests and 147 browser tests passed; production build passes; audit clean.

## Add order: sales made in the shop (2026-10-27)

- **Built:** an Add order button on the admin Orders page (owner and admin, new permission `orders:create_offline`). Search by name or SKU, quantities with the same rules as the shop (lengths in steps), optional walk-in name and phone, optional whole-bill discount (rupees or percent) with a required reason, paid by cash, UPI or card. Stock comes off at once, a Bill of Supply is issued, the order appears tagged "In store". A sale made by mistake can be voided (stock goes back). Reports gain "Where sold"; store sales are kept out of "to ship", the checkout funnel and buyer counts. See `docs/order-lifecycle.md` §5a.
- **Verified:** 18 integration tests in `tests/integration/offline-orders.test.ts` pass (stock, movements, idempotency, discounts, void, permissions, reports, walk-in account). The two Playwright tests in `tests/e2e/offline-orders.spec.ts` pass against a development server on a throwaway database, including an axe check of the form.
- **Not verified:** the full Playwright suite and a production build. `next build` refuses to run on Next 16.4.0 because of published security advisories (fixed in 16.4.1 and later); the owner has not yet decided on the upgrade.
- **Not built:** customer accounts on store sales, returns or exchanges, pay later, part payments.

## Phase 10 — what was built

- **Product ratings and reviews:** only buyers whose order was delivered can review a product they bought; one review per person per product (editing sends it back for approval); reviews are plain text only (links limited, markup shown as text); nothing is public until staff approve it. Approved reviews feed the product's average and count, shown as stars on the product page, in listings, and as `aggregateRating` structured data (only when approved reviews exist). Staff moderate at Admin, Reviews (approve, refuse with a note, delete).
- **Information pages:** shipping, returns and refunds, privacy, terms, questions and answers, about, contact, each with a first-draft text that matches the shop's rules; the owner edits them at Admin, Pages (simple formatting, no HTML) and can go back to the draft. Titles and descriptions follow the edits.
- **Track your order:** order number plus email, no sign-in; shows status and courier progress only (no address, phone or prices); a wrong number and a wrong email give the same answer; limited per visitor and per order number.
- **Contact:** shop email, phone and address from Settings; a message form (hidden until an email is set) that queues an email to the shop with the visitor as reply-to; bot trap and rate limit.
- **Search engines:** `sitemap.xml` (active products, categories, collections, pages) and `robots.txt` (the whole site asks to be left out unless it is the real public address in production; private areas always blocked). Redirects: moved product, category and collection addresses can be redirected from Admin, Redirects (loops and chains refused); a changed product address makes one automatically.
- **Photo upload (code ready):** staff pick photographs on the product page; the browser sends them straight to Cloudinary with a one-time signature from this site (the secret never leaves the server); JPEG, PNG, WebP or AVIF under 8 MB. It switches on when the three Cloudinary keys are set.

## Phase 10 — verification actually run (2026-10-15)

| Check                                                                                                                                                     | Result                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                                                                                                                              | 646 tests passed                                                                                                                                                                                                                                                                          |
| Review integration tests (10): who may review, one per person, approval flow, rating arithmetic, edits, refusals, deletion, markup stays text, permission | passed                                                                                                                                                                                                                                                                                    |
| Content, sitemap, redirects, tracking and contact tests (19), markup and Cloudinary signing tests (6)                                                     | passed                                                                                                                                                                                                                                                                                    |
| Playwright                                                                                                                                                | 141 passed in the full suite (every information page: one heading, no accessibility violations, no console errors; footer links; the full review journey from purchase to rating on the page and in structured data; edit a page and see it; contact form; redirects; robots and sitemap) |
| Production build with no database or secrets                                                                                                              | passes                                                                                                                                                                                                                                                                                    |
| `pnpm audit --prod`                                                                                                                                       | no known vulnerabilities                                                                                                                                                                                                                                                                  |

## Phase 10 — not verified, not built, or to decide

- **Not verified:** a real upload to Cloudinary (no account yet: the signing is tested against an independent computation of Cloudinary's rule, not against their servers); sitemap acceptance in Google Search Console; real email delivery of contact messages (the outbox and Resend path are the same as other emails); rich-result eligibility of the structured data.
- **The policy texts are drafts.** They follow your stated rules but must be read, changed and approved by you, and the privacy policy and terms should be reviewed by a lawyer before launch. The Pages list marks each page "Original draft, not yet reviewed" until you save it.
- **Not built:** review photos, replies to reviews, "helpful" votes, verified-buyer emails asking for a review, FAQ structured data, redirects for arbitrary pages (shop addresses only), per-page social images, image deletion in Cloudinary when a photo is removed.
- **Known limits:** a newly approved review or edited page can take a few seconds to appear; redirects need the old address to be gone from the shop.

## Phase 9 — what was built

- **Admin frame and dashboard:** a menu that shows only what the signed-in role may open (one table, `config/admin-nav.ts`, drives the menu, the pages and the tests); dashboard cards for orders today, sales (today and 7 days), to ship, returns, orders needing attention, low and out-of-stock, each shown only to roles allowed to see it.
- **Products and variants:** list with search, status filter and paging; create and edit with plain-language errors beside the field; variants with colour, size, price, sale window, ordering rules in metres, low-stock warning, starting stock; a changed address leaves a permanent redirect; every change refreshes the listing summary and expires the shop's cached pages at once.
- **Categories and collections:** one-level categories, manual and rule-based collections.
- **Inventory:** stock list (all, running low, out), search, add, remove or set stock in metres with a reason (every change recorded and repeat-safe), movement history in the service, spreadsheet download that is safe from formula tricks.
- **Orders:** the Phase 8 pages gain payments, refunds and a refund form (staff permission; super admin above ₹5,000).
- **Coupons:** create and edit with validation. **Customers:** search, suspend and restore. **Staff and roles:** change roles (never above your own; the last super admin is protected). **Settings:** shop name, shipping charge and free-shipping level, return window, stock hold time, GST switch, announcement bar. **Audit log:** newest first, filter by action.

## Phase 9 — verification actually run (2026-10-15)

| Check                                                                                                                                                                                                                                                      | Result                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                                                                                                                                                                                                                               | 615 tests passed                                                                                                                                                                                              |
| Admin integration tests (36): every role against every admin operation (permission matrix), product/variant/category/collection/coupon/settings persistence, duplicate and invalid input, stock arithmetic and repeats, CSV formula safety, literal search | passed                                                                                                                                                                                                        |
| Playwright                                                                                                                                                                                                                                                 | 126 passed in the full suite (owner opens every section; support only their sections; visitors and customers get nothing; a product is created in the admin and appears in the shop with its price and stock) |
| Production build with no database or secrets                                                                                                                                                                                                               | passes                                                                                                                                                                                                        |
| `pnpm audit --prod`                                                                                                                                                                                                                                        | no known vulnerabilities                                                                                                                                                                                      |

## Phase 9 — not verified, not built, or to decide

- **Image upload is not built.** Cloudinary has no account yet, so photographs are entered as Cloudinary addresses with a description (only `res.cloudinary.com` over https is accepted). A real upload button needs the account and a signed-upload route.
- **Not built:** product CSV import (stock export exists); reviews moderation (there is no review feature yet); content and policy page editing and SEO tools (Phase 10); bulk edit; admin two-factor sign-in; a customer detail page with order history; analytics beyond the dashboard cards; per-collection ordering of products.
- **Known limits:** a product the admin has just published can show "not found" for up to 5 seconds in the shop (the address check caches misses briefly); the staff page cannot invite someone who has no account yet; categories may only be hidden, not deleted.
- **Not verified:** real devices and screen readers on the admin screens; accessibility was checked by the automated scan on the new-product page only.

## Phase 8 — what was built

- **Courier layer** (`lib/shipping/`): a provider interface with a Shiprocket REST adapter and a development mock. Selected by env like payments; production without Shiprocket sign-in refuses to ship.
- **Before ordering:** PIN code check on product pages (rate limited); checkout refuses a PIN no courier serves (if the courier service is down the order is allowed and the failure logged).
- **Booking:** staff with `shipments:manage` book a courier for a paid order; one booking at a time per order (claimed atomically, so two staff create exactly one); cancel a booking until pickup; label link.
- **Tracking:** courier webhook (`/api/webhooks/shiprocket`, token header) plus a cron sync as a safety net. Updates only move forward, so late, repeated and out-of-order messages change nothing; repeats are recognised by event id. Shipped and delivered emails.
- **Cancellation:** a customer may cancel a paid order until it is being prepared; staff with `orders:cancel` until the courier has the parcel. Stock goes back, coupon use returns, full refund, email.
- **Returns:** customer asks within the window (default 7 days from delivery, a setting) for returnable items only (never fabric cut to length), never more than bought; staff approve or refuse (with a reason); on receipt the items are restocked and the price paid for them (after discount, not shipping) is refunded.
- **Order completion:** delivered orders become completed after the return window, unless a return is open.
- **Pages:** order page shows tracking, cancel and return; minimal staff pages `/admin/orders` (all, to ship, returns) and `/admin/orders/[number]` (book, cancel, returns). Phase 9 builds the full admin.

## Phase 8 — verification actually run (2026-10-14)

| Check                                                         | Result                       |
| ------------------------------------------------------------- | ---------------------------- |
| `pnpm check`                                                  | 579 tests passed             |
| Fulfilment integration tests (26) and courier unit tests (12) | passed                       |
| Playwright                                                    | 121 passed in the full suite |
| Production build with no database or secrets                  | passes                       |
| `pnpm audit --prod`                                           | no known vulnerabilities     |

## Phase 8 — not verified, not built, or to decide

- **Not verified:** every call to real Shiprocket (adapter written from its documentation, run against recorded-shape mocks only); real webhooks and their exact payload and status wording; label generation; real serviceability data. A sandbox run is required before launch.
- **Assumptions to confirm:** parcel weights default to 250 g per metre of fabric and 300 g per ready-made piece until products carry real weights; the parcel is a fixed 30 x 25 cm footprint; the customer is charged the flat shipping rate in settings, not the courier's rate; the warehouse PIN code and Shiprocket pickup location come from env (`SHIPPING_ORIGIN_PINCODE`, `SHIPROCKET_PICKUP_LOCATION`).
- **Not built:** return pickup booking with the courier (returns are customer-sent); exchange; partial-quantity shipments; multiple warehouses; non-delivery follow-up screens; admin 2FA; a retry button for a cancellation whose refund step failed (it is logged and audited; staff refund by hand).

## Phase 7 — what was built

- **Brand pass:** the shop is now "Ambar" with the supplied logo (header mark, favicon, apple icon); order numbers are `AM-YYMM-NNNNNN`.
- **Totals engine** (`lib/pricing/totals.ts`): coupon shared across lines exactly, shipping decided after the discount (default flat ₹80, free from ₹1,500; settings), tax per line (off by default; inclusive or exclusive when switched on).
- **Orders:** typed state table (`features/orders/state.ts`) with compare-and-set transitions, order snapshot (items, prices, address), idempotent checkout, stock held 20 minutes, coupon use claimed atomically, everything given back on failure, expiry or cancel.
- **Payments:** gateway interface with a Razorpay REST adapter and a development mock. Browser proof is checked by signature and by asking the gateway; webhook (`/api/webhooks/razorpay`) checks the signature over the raw body and records event ids so repeats do nothing; late, duplicate, out-of-order and wrong-amount payments are handled; an unfulfillable paid order is refunded automatically.
- **Refunds:** amount claimed on the order before the gateway call, so refunds cannot exceed what was paid even in parallel; idempotent; staff path needs `refunds:create` and a super admin above ₹5,000.
- **Pages:** `/checkout`, `/account/orders`, `/account/orders/[number]` (pay, cancel, thank-you), confirmation email.
- **Cron** (`/api/cron/jobs`) now also expires unpaid orders (checking the gateway first) and stale holds.

## Phase 7 — verification actually run (2026-10-14)

| Check                                                                                                                                                                                     | Result                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `pnpm check`                                                                                                                                                                              | 541 tests passed (31 files) |
| Order integration tests (31): idempotent checkout, last-stock and last-coupon races, forged proofs, duplicate/out-of-order/concurrent webhooks, expiry, late payment, refunds in parallel | passed                      |
| Playwright                                                                                                                                                                                | 116 passed (full suite)     |
| Production build with no database or secrets                                                                                                                                              | passes                      |
| `pnpm audit --prod`                                                                                                                                                                       | no known vulnerabilities    |

## Phase 7 — not verified, not built, or to decide

- **Not verified:** any call to real Razorpay (no account yet): the REST adapter's request shapes follow Razorpay's documentation but have only been exercised against mocks; the browser payment window; real webhooks; real refunds. A test-mode run is required before launch.
- **Not built:** admin screens for orders, refunds and coupons (Phase 9); tax split into CGST/SGST/IGST and invoices (GST not registered); COD; CSP allowing `checkout.razorpay.com` (Phase 13); amount-mismatch orders are flagged but not auto-refunded.
- **Found and fixed along the way:** the bag could be doubled by a repeated sign-in merge, or overwritten by a slow answer; adding while the sign-in state was unknown went to the browser instead of the account.

## Phase 6 — what was built

- **Inventory service** (`services/inventory-service.ts`): `reserveStock` (all lines or none, in a transaction, fixed lock order, idempotent per order), `commitReservation`, `releaseReservation`, `expireDueReservations`, `adjustStock` (restock, wastage, recount; refuses to go below what is held; a repeated idempotency key applies once). Every change is one guarded update plus an append-only `InventoryMovement` row. New models: Cart, InventoryMovement, InventoryReservation.
- **Cart service** (`services/cart-service.ts`): the stored bag holds variant and quantity only. Prices, sale windows, stock and min/step/max limits are recomputed from the catalogue on every read (pricing engine v1: per-line rounding, no tax or shipping yet). Changes use optimistic concurrency, so two tabs cannot lose each other's edits. Guest bag merge on sign-in adds quantities, clamps to what is available and says so.
- **Bag page** `/cart`: server-priced lines, quantity steppers, remove, invalid or removed items shown with a reason and left out of the total, subtotal. Signed-in people use the saved bag on every device; guests use their browser. The sign-in, sign-out and shared-device rules match the wishlist.
- **Checkout button is disabled** ("Checkout opens soon") until Phase 7.

## Phase 6 — verification actually run (2026-10-14)

| Check                                                                                          | Result                                                                     |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `pnpm check` (typecheck, lint, format, unit and integration)                                   | 501 tests passed                                                           |
| 50 parallel orders for 1 m against 10 m                                                        | exactly 10 succeed, 40 refused, reserved equals on hand, 10 movement rows  |
| Mixed burst of reserve, commit and release                                                     | `0 <= reserved <= onHand`, and movement totals reproduce the stock exactly |
| Parallel release of one reservation                                                            | exactly one wins                                                           |
| Quantity matrix (below minimum, off step, above stock, unknown or inactive item, malformed id) | all rejected, bag unchanged                                                |
| Price recalculation (price change, sale window in and out)                                     | follows the catalogue on the next read                                     |
| Playwright (including axe, heading order and layout shift on `/cart`)                          | 112 passed                                                                 |
| Production build with no database and no `AUTH_SECRET`                                         | passes                                                                     |
| `pnpm audit --prod`                                                                            | no known vulnerabilities                                                   |

## Phase 6 — not verified, not built, or to decide

- **Not built:** reservations are not used by anything yet (checkout is Phase 7); the expiry job is not scheduled (add it to the cron in Phase 7); stock adjustment screens (Phase 9); the nightly invariant check.
- **Not verified:** behaviour on Atlas (transactions are tested on a local replica set; Atlas supports them); `pnpm db:indexes` for Cart, InventoryMovement and InventoryReservation not run against Atlas; real devices and browsers other than Chromium.
- **Brand:** the owner confirmed the name **Ambar** and supplied a logo (dark green square, cream interlocking mark). The app still says "Ambar Fabrics" and has no logo. Not changed in this phase; proposed as a small brand pass.
- **Returns:** cut fabric is non-returnable (confirmed by the owner). Ready-made items have a return policy to be written.
- **Dupatta subcategories:** the owner will supply them later.

## Phase 5 — what was built

- **Auth:** Auth.js v5, no adapter, JWT sessions holding only `uid` and `sv` (role and status are read from the database on every request). Email and password (Argon2id, policy of 10 to 128 characters, rejects passwords containing the person's name or email), Google sign-in only when `AUTH_GOOGLE_ID/SECRET` are set (verified email only; an unverified local account is taken over and its password removed).
- **Flows:** register, verify email, sign in, forgot and reset password, change password, sign out everywhere (`sessionVersion`). One-time tokens are stored as SHA-256 hashes, single use, claimed atomically. All flows are enumeration-safe.
- **Account area:** profile, addresses (limit, default address), security, orders (empty state until Phase 7), wishlist saved to the account and merged with the guest list.
- **Admin skeleton:** role and permission matrix, `assertPermission`/`assertOwnership`, proxy guard for `/account` and `/admin`, "last super admin" protection, `pnpm admin:create` (dry run unless `--yes`).
- **Infrastructure:** MongoDB rate limiter (replaces the planned Upstash), email outbox with retries and dead-letter drained by `/api/cron/jobs` (needs `CRON_SECRET`), audit log. In development the email links are printed to the terminal; elsewhere only a notice is logged.

## Phase 5 — verification actually run (2026-10-14)

| Check                                                        | Result                                                               |
| ------------------------------------------------------------ | -------------------------------------------------------------------- |
| `pnpm check` (typecheck, lint, format, unit and integration) | 472 tests passed                                                     |
| Playwright (axe WCAG 2.2 AA, mobile, layout shift)           | 108 passed (full suite; the earlier 107 passed three times in a row) |
| Production build with no database and no `AUTH_SECRET`       | passes                                                               |
| Cross-origin form post (CSRF)                                | rejected                                                             |
| Layout shift on auth and account pages                       | 0 to 0.05                                                            |
| Lighthouse `/login`, `/register`                             | performance 95, accessibility 100, best practices 96                 |
| `pnpm audit --prod`                                          | clean (one dev-only `braces` advisory from Phase 1)                  |

## Phase 5 — not verified, not built, or to decide

- **Not verified:** real Google OAuth (no credentials), real Resend delivery (adapter tested against a mocked fetch), Safari, Firefox, real devices, screen readers, Atlas indexes for the new collections (`pnpm db:indexes` updated, not run against Atlas).
- **Not built:** admin 2FA, breached-password check, account deletion and data export, CSP (Phase 13), rate limiting of the public catalogue API (CDN only), order history (Phase 7).
- **Setup needed before launch:** `AUTH_SECRET`, `CRON_SECRET`, `AUTH_URL`, Google redirect URI `<site>/api/auth/callback/google`, Resend key and a verified sender domain, a cron calling `/api/cron/jobs`, then `pnpm admin:create`.

## Phase 4 — what was built

- **Pages:** home (hero, categories, new arrivals, bestsellers, "buy only the length you need"), `/shop`, `/categories`, `/categories/[slug]`, `/collections/[slug]`, `/new-arrivals`, `/bestsellers`, `/sale`, `/search`, `/products/[slug]`, `/account/wishlist` (guest wishlist). Each has metadata, loading skeletons and empty/not-found states.
- **Listing:** URL-driven filters (fabric, colour, pattern, price, in-stock), five sort orders, accessible numbered pagination made of real links, removable filter chips, mobile filter drawer. The filter form is a real GET form, so it also works without JavaScript.
- **Product page:** photo gallery (fabric artwork until photos exist), colour and size selectors (native radios), length selector with step buttons, typed input, quick-pick lengths and a measuring-tape scale that fills as the length grows, exact live price (`Add to bag, ₹450`), availability wording, per-order and stock limits, details, care and returns text, related products.
- **Guest bag and wishlist** (`stores/`): saved in the browser with strict validation of whatever is read back (storage is untrusted). The bag stores variant ids and quantities in base units, never prices. The header shows the bag count. **This is a precursor:** the server-validated cart, bag page and checkout are Phase 6/7; there is no page to view the bag yet.
- **SEO:** real 404s through the proxy, metadata in `<head>` for every visitor, indexing rules for filtered, searched and numbered pages, Product/Breadcrumb/Organization JSON-LD (details in `seo-strategy.md` §10).
- **Self-contained browser tests** (`scripts/e2e-server.ts`), self-hosted fonts, and `.next`-independent CI build.

## Phase 4 — verification actually run (2026-10-14)

| Check                                                                               | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm typecheck`, `lint` (0 warnings), `format:check`                               | pass                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `pnpm test`                                                                         | 21 files, **307 tests pass**: now also covers URL/filter/pagination logic, purchase logic, stores (including tampered storage), structured data, metadata, colour helpers, the purchase panel component, the slug guard, and integration tests for the new filters                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `pnpm test:e2e` (Playwright, Chromium, seeded throwaway database, production build) | **72 tests pass**: every public route loads directly and after refresh; unknown slugs are real 404s; browsing, filtering, sorting, pagination, search (name, keyword, SKU, markup treated as text); the product purchase flow (exact pricing, off-grid and over-stock lengths rejected, sold-out, sizes, per-order limits, bag persists across refresh and respects what is already in it); wishlist; axe WCAG 2.2 AA on desktop and mobile; one `h1` and no skipped heading levels on seven page types; no horizontal scroll at 390 px; no console errors; metadata in `<head>` for browser, Googlebot, Facebook and Twitter user agents; JSON-LD parses and contains no invented ratings |
| Production build with `MONGODB_URI` empty (CI scenario)                             | pass                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Live check against your Atlas database (dev server)                                 | 10 public routes 200; 3 unknown slugs 404; no errors or warnings in the server log                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Lighthouse (mobile profile, local seeded production build)                          | performance 90 to 97, accessibility 98 to 100 (heading order since fixed and tested), best practices 96, **SEO 100**, CLS 0, TBT 10 to 40 ms. LCP 2.6 to 3.6 s on placeholder artwork, see below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

Bugs found by the tests and visual review, now fixed: the build baked database data into the home page (now per-request, so builds need no database); metadata streamed into the body instead of `<head>` for Googlebot and browsers; filter checkbox ids duplicated between the sidebar and the mobile drawer (drawer checkboxes had no accessible name); out-of-range page numbers were indexable; a variant label showed only the colour (four sizes of one colour read the same); hero and gallery animations hid the largest element until JavaScript ran (hero is now CSS-only, gallery fades only after a click); pale placeholder artwork rendered blank; the tape label wrapped; the secondary button border was nearly invisible.

## Phase 4 — not verified, not built, or to decide

- **Sample data is now in your Atlas database** (34 products, 90 variants, 3 collections, and the category structure), loaded with `pnpm db:seed --yes` as agreed. Remove the sample products with `pnpm db:unseed --yes` (categories are kept). The categories themselves are created by the seed: dupatta subcategories and trims are placeholders to confirm.
- **LCP is above the 2.5 s target in Lighthouse's throttled profile (2.6 to 3.6 s)**, driven by rendering large placeholder artwork under 4× CPU throttling; server response is 20 to 130 ms. Real product photographs will define the real LCP, so this must be re-measured after photos are uploaded (Phases 9/13). Field data (real users) does not exist yet.
- **Dead links:** the header and footer link to pages built later: `/login`, `/cart`, `/track-order`, `/shipping-policy`, `/return-refund-policy`, `/faq`, `/about`, `/contact`, `/privacy-policy`, `/terms-and-conditions`. They show the 404 page and Next logs a prefetch 404 for each. The tests list them explicitly in `NOT_BUILT_YET` (`tests/e2e/helpers.ts`); any other failing request fails a test.
- **Returns text on product pages** only reflects each product's `returnable` flag ("cut to the length you choose, so it cannot be returned unless faulty" for non-returnable fabric). Your exact return policy for cut fabric and unstitched sets is still to be confirmed (assumption A-9) before the policy pages are written.
- **Not built (listed in the Phase 4 scope or earlier briefs):** recently viewed products (needs storage plus a lookup; low value until there is traffic), real product photographs (admin upload is Phase 9), `sitemap.xml` and `robots.txt` (Phase 10), rate limiting on the public API (not covered by Phase 5).
- **Not tested:** Safari and Firefox, real phones, slow real networks, screen readers (only axe and keyboard tests), Hindi text rendering (fonts include only the Latin subset).
- **Search** is MongoDB text search plus exact SKU. Fine for ~200 products; typo tolerance is not provided.
- Two identical `noindex` robots tags appear on 404 pages (one from Next, one from the rewrite); harmless.

## Phase 3 — what was built

- **Models:** Category (two-level), Collection (manual and smart, with visibility window), Product, ProductVariant (selling unit, price, sale window, stock, order), SiteSettings (tax off by default), Redirect. Validation covers integer money and quantities, slug and SKU formats, sale and compare-at rules, reserved <= on-hand, and required image alt text.
- **Libraries:** `money`, `measure`, `inventory`, `slug` (see `inventory-and-measurements.md` §7).
- **Read side:** repositories (the only code touching Mongoose), `catalog-service` (list, filters, facets, search, SKU lookup, detail, related, suggest, categories, collections, public settings), cached wrappers with tags, DTOs that are plain and serialisable.
- **API:** nine public `GET` endpoints under `/api/v1` (see `api-contracts.md` §10) behind one `apiHandler` (request id, validation, single error format, cache headers).
- **Scripts:** `db:seed` (34 sample products, 90 variants, 3 collections, your category structure; dry run by default and shows the target database), `db:unseed`, `db:indexes`.

## Phase 3 — verification actually run (2026-10-14)

| Check                                    | Result                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`, `lint`, `format:check` | pass                                                                                                                                                                                                                                                                                                                                                                                                      |
| `pnpm test`                              | 15 files, **210 tests pass**: money and measurement (including randomised checks against exact big-integer arithmetic), pricing and sale windows, query validation, API handler error handling, and 53 integration tests against a real MongoDB (seeding, pagination, category and collection scoping, every filter, all sorts, search, SKU lookup, facets, detail, validation rules, unique constraints) |
| Index usage                              | `explain()` on slug lookup, category listing, bestsellers, text search, SKU lookup and variants-by-product: no collection scans                                                                                                                                                                                                                                                                           |
| `pnpm build`                             | pass; all API routes dynamic, so the build needs no database                                                                                                                                                                                                                                                                                                                                              |
| `pnpm test:e2e`                          | 12 Playwright tests still pass                                                                                                                                                                                                                                                                                                                                                                            |
| Live HTTP check (local MongoDB, seeded)  | list, filter, detail, related, suggest, categories, collection and settings endpoints return the expected data; unknown slug and malformed slug give 404; bad query gives 422 with field details; no raw stock in any response                                                                                                                                                                            |
| Database down                            | already-cached pages keep serving; uncached requests give 503 with `Retry-After` and no internal detail; connection strings never appear in logs                                                                                                                                                                                                                                                          |

Bugs found by the tests and fixed: variants had no defined order (added `sortOrder`); driver errors on an open connection returned 500 instead of 503; sample data used fractional counts and an invalid sale configuration (the validators rejected them).

## Phase 3 — not verified or not built

- **Your Atlas database was not touched.** All checks ran against a local in-memory MongoDB. To load the sample data into Atlas run `pnpm db:seed` (it prints the target and changes nothing), then `pnpm db:seed --yes`. Remove it later with `pnpm db:unseed --yes`.
- **Rate limiting on the public API** is not in place (the Phase 5 limiter covers auth only). The cache is the only protection until then.
- **Sale-window refresh job**: product cards store a price summary computed at save time, so a scheduled recompute is needed for sales that start or end by themselves (Phase 12). Detail pages are unaffected.
- **Atlas Search** is not used. MongoDB text search with exact SKU lookup is enough for about 200 products (assumption A-13); revisit if relevance proves poor.
- Search quality on real data (typos, Hindi names) cannot be judged on sample data.
- Production index creation (`pnpm db:indexes --yes` against Atlas) has not been run.
- Inventory reservations and stock movements (Phase 6) and admin write paths (Phase 9) do not exist yet; products can only be created by the seed script for now.

## Phase 2 — what was built

- **Design system:** tokens (paper, ink, sage, linen, madder, brass), Gilda Display + Hanken Grotesk, selvedge rule motif, touch-friendly control sizes, reduced-motion handling. See `architecture.md` §11a.
- **Shell:** announcement bar, sticky header (desktop mega menu from `config/navigation.ts`; mobile drawer with accordion; search panel that is a plain GET form to `/search`; account, wishlist and bag links), footer with selvedge edge and policy links, skip link, Toaster and MotionConfig providers.
- **Components:** `ProductCard`, `PriceTag`, `CardMedia` (hover/focus image swap), `WishlistButton`, skeletons, `EmptyState`, `ErrorState`, `Breadcrumbs`, `ConfirmDialog`, `FabricPlaceholder`, shadcn `button`, `input`, `label`, `badge`, `sheet`, `dialog`, `accordion`, `navigation-menu`, `sonner`, `skeleton`, `breadcrumb`, `separator`.
- `lib/money.ts`: `formatPaise` (Indian grouping, strict integer paise) and `percentOff` (rounds down). Arithmetic and unit conversion arrive in Phase 3.
- Root `error`, `global-error` and `not-found` rebuilt on the new components; copy follows "say what happened and what to do".
- Dev-only `/dev/components` preview page (404 in production).
- Playwright + axe-core installed (Chromium); `pnpm test:e2e`; CI runs it.

## Phase 2 — verification actually run (2026-10-13)

| Check                                              | Result                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`, `pnpm lint`, `pnpm format:check` | pass                                                                                                                                                                                                                                                                                                                 |
| `pnpm test` (Vitest)                               | 8 files, 55 tests pass, including WCAG contrast of every token pair and real MongoDB integration                                                                                                                                                                                                                     |
| `pnpm test:e2e` (Playwright, Chromium)             | 12 tests pass: axe WCAG 2.2 AA scans on home, preview page, mega menu open, search open, dialog open, mobile drawer open; keyboard-only mega menu; search submits `/search?q=`; skip link; real 404 status; reduced motion; no horizontal scroll at 390 px; 40 px touch targets; **zero console errors or warnings** |
| `pnpm build`                                       | pass; `/` static, `/dev/components` returns 404 in production                                                                                                                                                                                                                                                        |
| Visual review                                      | screenshots at 390, 820 and 1360 px reviewed; mega menu, search, drawer and card grid checked                                                                                                                                                                                                                        |

Bugs found and fixed by those checks: Base UI `nativeButton` console errors; links rendered through `Button`/`SheetClose` being announced as buttons (header and drawer); a hydration mismatch when reduced motion was on (wishlist animation); skeletons too faint; accordion forcing link underlines.

## Phase 2 — not verified

- Real product photography and `next/image` behaviour (no images exist yet; placeholders are used). Image loader and Cloudinary arrive in Phase 3/4.
- Lighthouse and Core Web Vitals (the shell has no real content to measure yet; planned for Phase 4 and 13).
- Safari and Firefox (only Chromium was run). Real-device testing.
- Cart count is a prop that defaults to 0; the cart store and drawer arrive in Phase 6. Header links to `/login`, `/cart`, `/account/wishlist`, `/search` and the category routes point at pages built in later phases and currently 404.
- Category names in the navigation are samples to be confirmed with the owner (dupatta categories in particular).

## Phase 1 — what was built

- Git repository initialised (`main`, nothing committed yet).
- Next.js 16.4.0 + React 19.3 + TypeScript strict (also `noUncheckedIndexedAccess`, `noImplicitOverride`),
  Tailwind CSS 4, shadcn/ui (Base UI flavour) with one component (`button`), pnpm 11.
- Tooling: ESLint (with layering and `react/no-danger` rules), Prettier (+ Tailwind class sorting),
  EditorConfig, `.nvmrc`, GitHub Actions CI, `pnpm check` aggregate script.
- Environment validation (`src/lib/env`): public (build fails on invalid) and server (lazy, grouped per
  integration via `requireGroup`). Errors name variables, never values.
- MongoDB connection (`src/lib/db/mongoose.ts`): cached on `globalThis`, small pool, fail-fast, generic
  `DatabaseUnavailableError` to callers with details only in logs, retry after failure, `sanitizeFilter` on.
- Logger (pino, redaction), error types, `/api/health` (live DB ping, 200/503, `no-store`).
- Base layout: skip link, announcement bar, header and footer shells, design tokens (ivory, charcoal,
  sage, terracotta, gold), display serif + sans fonts, reduced-motion CSS, root `error`, `global-error`,
  `not-found`.
- Static security headers (nosniff, frame deny, referrer, permissions, HSTS in production).
- Local database options: `docker-compose.yml` single-node replica set, or `pnpm db:dev` (in-memory replica set).
- `.env.example` (placeholders only), README.

## Decisions and findings

- Next.js 16 differs from remembered APIs: read the bundled docs in `node_modules/next/dist/docs`.
  `proxy.ts` replaces middleware, Cache Components is on, error boundaries use `retry`.
- `cn` (shadcn maintainer's package) is what generated shadcn code imports; kept.
- pnpm 11 resolves packages with a release-age delay (it installed mongoose 9.11.1, not the newest 9.11.2).
- Build-script approvals recorded in `pnpm-workspace.yaml`: esbuild, sharp, unrs-resolver and
  mongodb-memory-server are declined (binaries come from optional deps or lazily at first use).
- `NEXT_PUBLIC_APP_URL` must be https in production, but http://localhost is allowed so a local
  `build && start` works.

## Verification actually run (2026-10-13)

| Check                          | Result                                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| `pnpm typecheck`               | pass                                                                                      |
| `pnpm lint`                    | pass (0 errors, 0 warnings)                                                               |
| `pnpm format:check`            | pass                                                                                      |
| `pnpm test`                    | 5 files, 25 tests pass (env, logger, DB mocks, shell components, real MongoDB)            |
| `pnpm build`                   | pass (`/` static, `/api/health` dynamic); fails as intended without `NEXT_PUBLIC_APP_URL` |
| Lint layering rule             | confirmed to fire on a deliberate `mongoose` / `@/models` import in `components/`         |
| Production server + real Mongo | `/api/health` 200 `up`; after stopping Mongo, 503 `degraded`, home still 200              |
| Missing `MONGODB_URI`          | health 503, logged as `ConfigError` (variable name only), no connection string leaked     |
| `pnpm dev`                     | starts; `/` 200, unknown route 404, no warnings                                           |
| Security headers               | present on `/`                                                                            |
| `pnpm audit --prod`            | no known vulnerabilities                                                                  |

## Not verified

- **Docker compose file**: written but never run (Docker is not installed on this machine).
- **GitHub Actions workflow**: written but never run (no remote repository yet).
- Atlas, Vercel and all third-party services: nothing configured.
- Lighthouse / Core Web Vitals, accessibility audit: scheduled for later phases.

## Known issues

- `pnpm audit` (all deps) reports one high advisory: `braces <=3.0.3` ReDoS via
  `eslint-config-next` → `fast-glob` → `micromatch`. Dev-only, and no patched release exists on npm.
  CI audits production dependencies only. Re-check periodically.
- Auth.js v5 is still a beta (decision A-2).
- The `shadcn init` command wrote only `components.json` and no CSS or utilities; tokens in
  `globals.css` are hand-written to use the same variable names.

## External integrations pending

Atlas, Vercel, Google OAuth, Razorpay (test account, then live KYC), Shiprocket, Resend, Cloudinary,
Upstash, GA4 / Search Console, Sentry. None configured.

**Owner answers after Phase 8 (2026-10-14):** warehouse PIN code is 390007 (set as `SHIPPING_ORIGIN_PINCODE` in `.env.local`); the parcel weight and size defaults are close to reality and stay as they are. Still needed: the Shiprocket pickup location name, once the account exists.

## Master fabrics and prints, draggable categories (2026-10-15)

- **Fabrics and prints are defined once** (`Taxon` model, kind `fabric` or `print`) and chosen on any product, in any category. Cotton, Crepe, Gaji silk, Modal silk, Bandhani, Ajrakh and so on each exist once; a bandhani dupatta in crepe or gaji silk, and an ajrakh blouse in cotton or modal silk, just pick two entries. Admin: Fabrics and Prints pages (add, rename, hide, drag to reorder, delete only when unused). Renaming propagates to every product using it.
- **Shop**: `/fabrics`, `/fabrics/[slug]`, `/prints`, `/prints/[slug]` list everything made of that fabric or in that print, across categories (filters still narrow within them). Product pages link to their fabric and print; header, footer and sitemap include them. Hidden entries keep working on products but get no page.
- **Categories** can be dragged (handle, mouse or keyboard), moved with up/down buttons, or placed with the "Top level / Inside X" menu. One level of sub-categories; a category with children cannot become a child. Saves immediately, validated again on the server, audited.
- **Existing databases**: run `pnpm db:indexes --yes` (new `Taxon` collection), then `pnpm db:link-taxa` (dry run) and `pnpm db:link-taxa --yes` to create masters from products' current fabric and pattern text and link them. Safe to repeat.
- Fixed along the way: admin paged lists sorted by date alone could repeat or skip rows when dates tied; they now break ties by id.
- **Verified**: `pnpm check` 722 tests; Playwright 154 (153 on the full run plus one layout-shift test that timed out under load and passed alone twice); production build with no secrets; `pnpm audit --prod` clean.

## Phase 11: analytics and reports (2026-10-15)

- **Google Analytics 4 with consent**: cookie banner (accept or no thanks, change later from the footer), nothing loads or is sent until accepted; full e-commerce event set with a once-per-order purchase; see `docs/analytics.md` for events, conventions and the DebugView checklist.
- **Admin reports** (`/admin/reports`): summary with comparison to the period before, sales by day (chart and table), best-selling products, sales by category, by fabric and by print, delivery states, coupons, orders started and how they ended, new and returning buyers, deliveries, returns and refunds; date picker and quick choices; a spreadsheet for each. Profit only for roles with `costs:read`; buyers only with `customers:read`. Definitions are in `docs/analytics.md` and checked by tests against hand-worked fixtures.
- **Fixed along the way**: Fabrics and Prints were missing from the admin side menu (only reachable by link); the Order date indexes needed for reports were added (`pnpm db:indexes --yes`).
- **Verified**: `pnpm check` 764 tests; Playwright 163; production build with no secrets and no GA id; `pnpm audit --prod` clean.
- **Not verified**: GA DebugView (needs a real GA4 property: the e2e tests check what the page hands to Google, with Google's address stubbed); a Content-Security-Policy that allows Google comes in Phase 13.

## Storefront list updates (2026-10-15)

- **Sub-category addresses**: `/categories/fabrics/modal-silk-fabrics` (canonical, breadcrumbs, menu, sitemap); the old `/categories/modal-silk-fabrics` and a wrong parent redirect permanently (308) with the filters kept. The `/categories` prefix stays because `/fabrics/*` and `/prints/*` are the master fabric and print pages.
- **Category pages** no longer show a row of sub-category buttons under the heading (they are in the header menu and on the Categories page).
- **Filters**: the panel is sticky and scrolls inside when taller than the screen; Price is now the first group, with a two-handle slider (keyboard, mouse and touch) plus the From and To number boxes; changing either applies at once.
- **List cards** have an option picker (when there are several), a quantity or length stepper, and an Add button, using the same rules as the product page (shared `useAddToBag`).
- **Verified**: `pnpm check` 767 tests; Playwright 175 (174 on the full run; the mouse-drag test in `taxonomy.spec.ts` failed once under load and passed alone three times); production build; `pnpm audit --prod` clean.

## One hamburger menu (2026-10-16)

- The header is the same at every size: hamburger on the left, logo centred, search, account, wishlist and bag on the right (account and wishlist move into the menu on phones).
- The hamburger turns into a cross; the menu slides in below the header with each main category at 2rem and 1rem of space above and below. A + opens a category's sub-categories in place. Escape, the dimmed page or any link closes it. Motion is shortened for people who prefer reduced motion.
- Replaced the desktop mega menu and the mobile drawer (`header-nav.tsx`, `mobile-nav.tsx` removed). The broken "Stoles" link was dropped from the config.

## New theme and scroll-driven home page (2026-10-19)

- **Theme** (from the Claude Design home page): ground `#F5EFE4`, paper `#FBF8F2`, sand `#EFE6D6`, ink green `#1C2B27` for buttons, the top bar and the footer, amber accents (`#8F5804` for small text, `#B8760A` for fills and lines only, `#7E4C04` with ivory text for Sale and New tags). Instrument Serif for headings and Hanken Grotesk for text, self-hosted with `next/font/local` (not `next/font/google`: the project builds without network). Buttons are pills; list pictures stay square, the home New arrivals row is 4:5.
- **Staff area unchanged:** the new theme is on `:root`; the admin layout's `admin-root` class makes `:root:has(.admin-root)` restore the old colours, corners and Gilda display face (pop-ups drawn into `<body>` follow, because `html` matches `:has`). A browser test checks both.
- **Navbar unchanged** in layout and behaviour; it only takes the new colours. The announcement bar is now ink.
- **Home page:** hero carousel, pinned wardrobe (4 outfits), horizontal category rail (real categories), 360° turn, looks in motion, cut-to-order (0.25 to 3 m, Block print cotton at ₹220 a metre), New arrivals (real products), festive offer, reviews, closing call to action, new footer. All copy, links, prices, photographs, the offer, the reviews, the WhatsApp number and the start year are in `src/content/home.ts`. The WhatsApp button and the "since" year on the badge stay hidden until their values are set. The festive offer and the reviews are not in the content file: see the next section.
- **No photographs yet:** every picture slot draws a plain tinted panel until a path is added in the content file. Wardrobe and hero photographs should be one model in one pose, portrait 2:3, at least 1600 px tall; the turntable needs 24 to 36 frames.
- **Motion:** GSAP (`gsap`, `@gsap/react`). All sections are client components using `useGSAP` with `gsap.matchMedia()`, so they are cleaned up on leaving the page. With reduced motion nothing is pinned, scrubbed or timed: the hero stays on its first slide, the wardrobe list chooses the outfit, the category row scrolls by hand, and cut-to-order shows a fixed 2.5 m example. The page has window scroll only; the pinned stages sit under the shop's 4rem header.
- **Newsletter:** the sign-up form calls `subscribeAction`, which checks the address and rate-limits but does not store it yet (TODO in `src/features/home/actions.ts`).
- **Old home sections removed:** hero, category tiles, by-the-metre and the two product shelves.

## Festive offer and reviews on the home page (2026-10-20)

- **Offer from Admin → Coupons:** tick **Show on the home page** on a coupon. The band shows that coupon's real code, discount (percent or rupees), end date and smallest order, and disappears by itself when the coupon is switched off, not started, ended or used up. Only one coupon is shown: ticking one takes it off any other. The coupon's "Note for yourself" is private and never shown. The words around it (heading line, paragraph, button) are `home.offer` in `src/content/home.ts`.
- **Reviews from the shop:** the best approved reviews (4 and 5 stars, products on sale, one per product, best then newest) are read by `listHomeReviews` and shown with the first name and initial ("Meera S."), stars and a link to the product's reviews. No email, city or full name ever reaches the page. Nothing shows until the shop has reviews. There is no "all reviews" page, so there is no link for it.
- **Sample data for development:** `pnpm db:seed --yes` also adds the sample coupon `FESTIVE15` (15% off, 30 days) and eight sample reviews from `@sample.invalid` customers; `pnpm db:seed --remove --yes` removes exactly those. `seedSampleCatalog` is unchanged, so the integration tests are unaffected. The browser-test server loads the samples too.
- **Real database:** nothing was added to Atlas. Run `pnpm db:seed --yes` against a development database only.

## Hero backdrop (2026-10-20)

- Behind the hero arch: a full-width tint that cross-fades with each slide (`#F3E6DC`, `#ECEFE6`, `#F3EBD6`), a giant italic ghost word ("Utsav", "Roz", "Shaadi") that slides in on each change, a slowly turning mandala (`public/mandala.svg` used as a CSS mask, 90 s a turn), two thin arch outlines, and three floating fabric swatches that bob and pop in (not shown on phones). The mouse moves the swatches, mandala and ghost word by different amounts (mouse only; not on touch and not with reduced motion).
- The slide data (`tintBg`, `ghost`, `swatches`) is in `src/content/home.ts`. The mandala and the ghost word are drawn with CSS pseudo-elements, so they are never read as text or as a solid fill by assistive and accessibility tools.
- The sage background tint was corrected to `#ECEFE6` (it read `#ECEEE6`).
