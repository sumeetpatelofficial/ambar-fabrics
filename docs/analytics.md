# Analytics and reports

Two separate things: **Google Analytics** (what visitors do in the shop, with their consent) and **admin reports** (what was actually sold, from our own orders). They can disagree, and that is expected: GA only sees people who said yes and whose browser allowed it; the reports see every paid order.

## 1. Google Analytics 4

Switched on by setting `NEXT_PUBLIC_GA_MEASUREMENT_ID` (looks like `G-XXXXXXXXXX`). With no id there is no banner, no script, and no tracking code runs.

### Consent

- A new visitor sees a banner at the bottom of the page (it does not block anything): **Accept analytics** or **No thanks**. "No answer" counts as no.
- Nothing is sent to Google, and the Google script is not even downloaded, until they accept. Events that happen before the saved choice has been read are held briefly and dropped if the answer is no.
- The choice is kept in the browser (`af-consent`), for 12 months or until `CONSENT_VERSION` is raised, and can be changed any time from **Cookie settings** in the footer. Choosing no deletes Google's cookies (`_ga`, `_ga_*`) and switches Google's own off switch (`ga-disable-<id>`).
- Signed-in or not makes no difference. The staff area (`/admin`) never asks and never reports.
- Google signals and ad personalisation are off (`allow_google_signals: false`). Page views are sent by us, once per page change (`send_page_view: false`), so the single-page navigation is counted correctly.

### Events

| Event                                   | When                                                                                 | Where it comes from                                |
| --------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------- |
| `page_view`                             | every page change                                                                    | `Analytics` component                              |
| `view_item_list`                        | a list of products is shown (shop, categories, collections, fabrics, prints, search) | `ProductGrid` with `listName` = the page's address |
| `select_item`                           | a card in such a list is clicked                                                     | same                                               |
| `view_item`                             | a product page opens                                                                 | product page                                       |
| `add_to_cart`                           | after an item is added to the bag                                                    | purchase panel                                     |
| `remove_from_cart`                      | an item is removed on the bag page                                                   | bag page                                           |
| `view_cart`                             | the bag page shows a priced bag                                                      | bag page                                           |
| `begin_checkout`                        | the checkout page opens (once per visit)                                             | checkout                                           |
| `add_shipping_info`, `add_payment_info` | the customer presses Pay (address and Razorpay are chosen)                           | checkout                                           |
| `purchase`                              | the confirmation page of a paid order                                                | order page, **once per order**                     |
| `add_to_wishlist`                       | something is added to the wishlist                                                   | wishlist button                                    |
| `search`, `view_search_results`         | the search page shows results                                                        | search page                                        |

Not sent: `refund` (needs a server-to-Google call; refunds are in the admin reports instead), `login`, `sign_up`, promotion events (the shop has no promotion slots).

### Conventions

- Currency is `INR`; money is rupees with decimals (GA4 wants that), converted from paise exactly (`12345` becomes `123.45`).
- `item_id` is the product's web address (slug), the same on every page, so a funnel lines up. `item_variant` is "Colour / size". `item_category` is the product's last breadcrumb, on `view_item` only.
- `quantity` is in the unit the shop sells by: 2.5 for 2.5 metres, 3 for three pieces. `price` is per that unit, so `price × quantity` is the line total. (GA4 expects whole quantities; fractional ones are accepted and summed as given.)
- `purchase.value` is what the customer paid (items less discount, plus shipping and any tax); `tax` and `shipping` are sent separately; `transaction_id` is the order number.
- **Purchase dedupe:** the confirmation page can be opened many times (refresh, back, a link in an email). A purchase is reported once per order per browser (`af-ga-purchases`, last 50 orders), and Google also ignores a repeated `transaction_id`. Only the order's owner can open that page, and only a paid order shows the confirmation.
- Nothing about what the shop paid for the goods (cost, profit) is ever sent to the browser for analytics.

### Checking it (GA DebugView)

I could not do this one: it needs a real GA4 property. When you have one:

1. Put its id in `NEXT_PUBLIC_GA_MEASUREMENT_ID` and deploy (or `pnpm build && pnpm start` locally).
2. Install the "Google Analytics Debugger" extension, open the shop, accept the banner.
3. In GA → Admin → DebugView, walk through: product list → product → add to bag → bag → checkout → pay (use Razorpay test mode). Each event in the table above should appear with items, `INR`, and the right values.
4. Open the order confirmation again: no second `purchase`.

The Content-Security-Policy added in Phase 13 must allow `www.googletagmanager.com` (script) and `*.google-analytics.com` / `*.analytics.google.com` (connect).

## 2. Admin reports (`/admin/reports`)

Needs `analytics:read` (owner, admin, fulfilment manager). Profit needs `costs:read`; "Who bought" needs `customers:read`. Each section has a spreadsheet download with the same figures (`/admin/reports/export?report=…&from=…&to=…`).

### Definitions (the tests check these against the queries)

- **Period:** from and to are whole days in India (midnight to midnight, UTC+5:30), inclusive; at most 366 days; not in the future. The _comparison period_ is the same number of days immediately before.
- **Counted order (a sale):** payment status paid, partially refunded or refunded, by the day it was **placed**. Unpaid, expired, cancelled-before-payment orders are never sales.
- **Orders:** number of counted orders.
- **Item sales:** sum of the orders' subtotals (lines at their selling price, before discount, excluding shipping and tax).
- **Discounts:** sum of the orders' discounts. **Shipping charged:** sum of shipping. **Tax:** sum of tax (zero while the shop is not GST-registered).
- **Refunded:** sum of the orders' refunded amounts, counted against the day the order was placed (not the day of the refund).
- **Net sales:** `total paid − refunded`, so it includes shipping and tax. The overview page's "revenue" is the same figure.
- **Average order:** net sales ÷ orders, rounded to the paisa.
- **Sales by product / category / fabric / print ("item sales" in those tables):** each line's price less its share of the discount (shipping and tax excluded), so the totals of a table add up to `item sales − discounts`.
  - A product counts in its **first category**, shown under its parent ("Dupattas / Bandhani"). Fabric and print come from the product's master fabric and print. These are the product's **current** values, not those on the day it was sold; changing a product's fabric moves its past sales too.
  - "No fabric set" and "No print or plain" collect products without one.
  - **Order lines:** one product-and-option on one order.
- **Estimated profit:** per line, item sales less the cost recorded when it was sold. Lines sold without a recorded cost are left out of profit, and the summary says what share of item sales the profit covers. Never shown to roles without `costs:read`.
- **Where orders go:** counted orders by delivery state (net sales).
- **Coupons used:** counted orders with a code: orders, discount given, net sales.
- **Orders started and how they ended:** _every_ order created in the period, because an order is created when the customer presses Pay. Paid; waiting for payment (still open); payment failed; expired (not paid in time); cancelled before payment; something else. This is the closest the shop has to a checkout conversion figure; it does not count visitors who never pressed Pay (that is Google Analytics' job).
- **Who bought:** distinct accounts with a counted order in the period. _Returning_ = also had a counted order before the period began; _first-time_ = did not.
- **After the sale:** orders delivered in the period (by delivery day); paid orders in the period not yet delivered; return requests made in the period; refunds that were actually paid out in the period (processed, by the day of the refund) and their amount.

### Performance and rollups

Reports are computed on request from the orders, using indexes on `placedAt` and `createdAt` (run `pnpm db:indexes --yes` once for them). At thousands of orders this takes milliseconds. Pre-computed daily rollups would only be worth adding at many hundreds of thousands of orders; they are deliberately not built now, so the figures can never drift from the orders.
