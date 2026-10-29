# SEO Strategy

SEO is a design constraint, not a late phase. Nothing here promises rankings or traffic.

## 1. URL structure

| Page              | URL                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Notes                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Home              | `/`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |                                                                                       |
| Category          | `/categories/{slug}` (sub-category: `/categories/{parent}/{child}`, for example `/categories/fabrics/modal-silk-fabrics`. The older `/categories/{child}` address, or a wrong parent, gets a permanent 308 redirect to the right one in `src/proxy.ts`, keeping the query string. Canonical, breadcrumbs, sitemap and menus all use the nested address. The `/categories` prefix is kept rather than dropped because `/fabrics/*` and `/prints/*` already belong to the master fabric and print pages.) |                                                                                       |
| Collection        | `/collections/{slug}`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | seasonal ones respect their date window                                               |
| Product           | `/products/{slug}`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | slug is lowercase ASCII, hyphenated, unique, ≤ 80 chars, and contains no ids or dates |
| Shop all / search | `/shop`, `/search?q=`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |                                                                                       |
| Lists             | `/new-arrivals`, `/bestsellers`, `/sale`                                                                                                                                                                                                                                                                                                                                                                                                                                                                | real, curated content, not filter permutations                                        |

`/categories` index and `/shop` are included. Sort/filter query strings (`?sort=`, `?color=`, `?page=`) are **not** indexable by default (see §3).

## 2. Rendering and status codes

- Catalog pages are Server Components with cached data and tag revalidation, so crawlers get full HTML.
- Draft/archived product → **404** (archived products with inbound links may 301 to their category, set per product). Out-of-stock active products stay **200** with `OutOfStock` availability.
- Unknown slug → real 404 page (`notFound()`), never a soft-404 200.
- Slug changes create a `Redirect` (301). Chains are flattened and loops are rejected.
- Trailing slashes are normalized (no slash). Duplicate hosts (`www`) redirect to the canonical host.

## 3. Indexing policy

| Page type                                                              | Index                                                              | Canonical                                                                                                                  |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Home, category, collection, product, policy pages, about, FAQ, contact | index,follow                                                       | self                                                                                                                       |
| Category/collection page 2+                                            | index,follow                                                       | self (each page self-canonical; `rel=prev/next` is ignored by Google, so we rely on crawlable `<a href>` pagination links) |
| Filtered/sorted variants (`?color=…`)                                  | **noindex,follow** (and robots-disallow for internal search paths) | the base page                                                                                                              |
| `/search`                                                              | noindex,follow                                                     |                                                                                                                            |
| Cart, checkout, account, auth, admin, track-order                      | noindex, and blocked in robots                                     |                                                                                                                            |
| Product with `seo.noindex` or non-active                               | noindex or 404                                                     |                                                                                                                            |

Facet landing pages (for example "cotton fabric by the metre", "Ajrakh dupatta") are done through **real collections/categories** with unique copy, created only where there is demonstrated search intent and enough products. No mass-generated combinations.

## 4. Metadata

`generateMetadata()` per route, from one helper `buildMetadata({title, description, path, image, noindex})`:

- Title template from `SiteSettings.seoDefaults.titleTemplate`; per-entity override `seo.title`.
- Meta description: `seo.description`, else derived from the short description (trimmed to ~155 chars). The admin form warns on missing, too long, or duplicate values.
- `alternates.canonical` absolute, built from `NEXT_PUBLIC_APP_URL` + normalized path.
- Open Graph and Twitter cards: product image (≥ 1200×630 variant via Cloudinary transform), site name, locale `en_IN`.
- `metadataBase` set once.
- Uniqueness checks (title/description/slug) run in the admin save path and in a nightly report.

## 5. Structured data (JSON-LD)

Rendered server-side by typed builders in `lib/seo/jsonld.ts`, tested against schema fixtures. All data comes from the same source as the visible page.

- Site-wide: `Organization` (name, logo, URL, contact from settings, `sameAs` only for real profiles) and `WebSite` (with `SearchAction` only when `/search` exists).
- Category/collection/product: `BreadcrumbList` matching the visible breadcrumbs.
- Product: `Product` (name, image[], description, sku, brand if set, `offers` as `Offer` or `AggregateOffer` with `priceCurrency=INR`, price, `availability`, `itemCondition=NewCondition`, `url`, `priceValidUntil` only if a sale end date exists). **Price semantics for per-metre fabric:** the offer is described in the visible text as "per metre", and the `Offer` price equals the displayed unit price. `unitPriceSpecification` with `referenceQuantity` (1 `MTR`) is added for length-based items.
- `aggregateRating` and `review`: only when approved genuine reviews exist **and** are visible on the page.
- `shippingDetails`/`hasMerchantReturnPolicy`: only if they reflect configured, real settings, otherwise omitted.
- Escape `<` in the serialized JSON; never inject unsanitized rich text.

## 6. Sitemaps and robots

- `app/sitemap.ts` with `generateSitemaps()` splits into: static pages, categories+collections, products (chunks of ≤ 5,000 URLs). The sitemap index is referenced from `robots.txt`.
- `lastmod` = real `updatedAt`. Only canonical, indexable, 200 URLs. Archived/draft/noindex are excluded.
- `robots.ts`: allow public; disallow `/admin`, `/api`, `/account`, `/cart`, `/checkout`, `/login`, `/register`, `/track-order`, `/search`, and parameterized paths. **Non-production environments disallow everything** (plus `noindex` header on previews).

## 7. On-page and content

- One `h1` per page. Semantic landmarks, descriptive anchor text, and breadcrumbs from real hierarchy.
- Image alt text is required in the admin form for product images (default pattern "{product name} — {color}" suggested and editable). Decorative images use `alt=""`.
- Category/collection pages have an intro paragraph above the grid and optional longer content below, written for people (admin-editable).
- Product pages: unique descriptions, fabric details table (composition, width, care, origin), size/length guidance, shipping/returns summary, reviews, related products. They never use manufacturer duplicate text unmodified.
- Internal linking: breadcrumbs, related products, "shop the collection", footer category links, and new-arrival/bestseller modules, all as crawlable `<a>` links.
- Performance is SEO: LCP image priority, `next/font`, responsive `sizes`, no layout shift (reserved image ratios), and minimal client JS.

## 8. Measurement

GA4 (consent-gated) and Search Console (Domain property via DNS TXT). Submit the sitemap index. Review the Coverage, Core Web Vitals, and Merchant-listing reports. Optional Google Merchant Center product feed (`/feeds/google-merchant.xml`) is deferred to after launch. Track indexing issues in `docs/project-status.md`.

## 9. Verification (Phase 10 gate)

Rich Results Test and Schema validator on sample URLs, `curl` checks of status codes and canonicals for every page type, sitemap validation, a crawl (Screaming Frog or `lychee`) for broken links and redirect chains, and a Lighthouse SEO audit.

## 10. As implemented in Phase 4

- **Real 404s.** With Cache Components the HTTP status is sent with the prerendered shell, so `notFound()` inside a page can only produce 200 + `noindex`. Unknown `/products/*`, `/categories/*` and `/collections/*` URLs are therefore answered in `src/proxy.ts` (before rendering) by an in-memory slug check (`lib/slug-guard.ts`, 60 s for hits, 30 s for misses, bounded) and rewritten to a prerendered page that returns **404**. If the database cannot be reached the guard fails open: the page renders and shows its own not-found UI with `noindex`, so a database outage never becomes a site outage. Verified: unknown and malformed slugs return 404 with `noindex`; real ones return 200.
- **Metadata is in `<head>` for every visitor.** Next streams metadata into the body for normal browsers and Googlebot unless told otherwise. `htmlLimitedBots: /.*/` in `next.config.ts` makes title, description, canonical, Open Graph and Twitter tags blocking for all user agents. A test requests four pages as a browser, Googlebot, Facebook and Twitter and checks the raw HTML. Lighthouse SEO went from 90 to 100.
- **Indexing rules in code** (`features/catalog/listing.ts`, `listing-metadata.ts`): the plain listing and its numbered pages are indexable and self-canonical (`?page=2`); any filtered, sorted or searched view is `noindex, follow` and canonicalises to the base page; search results are never indexed; a page number beyond the last page is `noindex`.
- **Structured data:** `Product` (price, availability, per-metre `UnitPriceSpecification` for fabric, no ratings), `BreadcrumbList` on product, category and collection pages, and `Organization` on the home page. Serialised with `<` escaped.
- **Not done yet (Phase 10):** `sitemap.xml`, `robots.txt`, the redirect manager, SEO editing fields, `WebSite` search action. Lighthouse notes "robots.txt not found" until then.
- **Headings:** every page has one `h1` and never skips a level (tested on seven page types); product cards are `h2` directly under a page title and `h3` under a section heading.
