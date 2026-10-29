/**
 * The shop's information pages. Each has a first draft here so the site is complete from day one; the owner
 * edits the wording in the admin (Pages), and an edited page is stored in the database and used instead.
 *
 * IMPORTANT: the policy texts are drafts written from the shop's stated rules (cut fabric is not returnable,
 * ready-made items have a return window, not GST-registered yet). They must be read and approved by the owner,
 * and the privacy policy and terms should be reviewed by a lawyer before launch.
 *
 * Markup: a blank line starts a paragraph; "## " starts a heading; lines starting "- " make a list;
 * [label](/path) or [label](https://...) make a link. Nothing else is interpreted, and no HTML is ever allowed.
 */
export const PAGE_SLUGS = [
  "shipping-policy",
  "return-refund-policy",
  "privacy-policy",
  "terms-and-conditions",
  "faq",
  "about",
  "contact",
] as const
export type PageSlug = (typeof PAGE_SLUGS)[number]

export const isPageSlug = (value: string): value is PageSlug =>
  (PAGE_SLUGS as readonly string[]).includes(value)

export type PageDefault = { title: string; description: string; body: string }

export const PAGE_DEFAULTS: Record<PageSlug, PageDefault> = {
  "shipping-policy": {
    title: "Shipping",
    description: "Where we deliver, how long it takes and what it costs.",
    body: `We deliver across India through trusted courier partners.

## What it costs

Shipping is a flat charge on each order. Orders above the free-shipping amount shown in your bag ship free. The exact amount is shown in your bag and at checkout before you pay.

## How long it takes

We pack and hand over your order to the courier within 2 working days. After that, delivery usually takes 3 to 7 days depending on where you live. Fabric is cut to your length before it is packed, so please allow for that.

## Tracking

When the courier collects your parcel we email you a tracking number. You can follow it on your order page, or on [Track your order](/track-order) with your order number and email.

## Before you order

Enter your PIN code on any product page to check that we deliver to you. If a courier cannot reach your PIN code we will tell you before you pay.

## If something goes wrong

If your parcel is delayed, damaged or does not arrive, [contact us](/contact) with your order number and we will sort it out with the courier.`,
  },
  "return-refund-policy": {
    title: "Returns and refunds",
    description: "What can be returned, how, and how refunds are made.",
    body: `## Fabric cut to your length cannot be returned

Fabric is cut from the roll to the exact length you choose, so we cannot take back fabric sold by the metre. Please check the colour and length carefully before you order. If a fabric arrives damaged, or is not what you ordered, [contact us](/contact) within 2 days of delivery with your order number and a photograph, and we will put it right.

## Ready-made clothing and finished pieces

Ready-made items (kurtis, dresses, blouses, finished dupattas and similar) can be returned within 7 days of delivery if they are unused, unwashed and have their tags. Unstitched suit sets are returnable only when the pack is unopened.

## How to return something

Open your order under Your account, then Orders, and choose Return an item within 7 days of delivery. Tell us which item and why. When we approve it we will tell you where to send it. We refund once the item reaches us and passes a quick check.

## Refunds

Refunds go back to the payment method you used, usually within 5 to 7 working days of us receiving the item. Shipping charges are not refunded unless the item was faulty or wrong.

## Cancelling an order

You can cancel a paid order yourself from your order page until we start preparing it. You will be refunded in full. After that, [contact us](/contact) and we will do what we can.`,
  },
  "privacy-policy": {
    title: "Privacy policy",
    description: "What we collect, why, and the choices you have.",
    body: `This explains what personal information we collect when you use this shop, why, and what you can ask us to do with it.

## What we collect

- Your name, email address and phone number when you create an account or place an order.
- Your delivery addresses.
- Your orders, returns and the reviews you write.
- Your password, which we store only as a one-way scrambled value, never as you typed it.

## Payments

Payments are handled by Razorpay. We never see or store your card or UPI details. We keep only the payment reference and the amount.

## Why we use it

To take and deliver your orders, send you order emails, handle returns and refunds, keep your account secure and answer your questions. We do not sell your information.

## Who we share it with

Only the services needed to run the shop: the payment provider, the courier that delivers your parcel, and our email service. Couriers receive your name, address and phone number so they can deliver.

## Cookies and your browser

We use a sign-in cookie to keep you signed in, and your browser's storage to remember your bag and wishlist before you sign in.

If you accept, we also use Google Analytics cookies to count visits and see which pages and products are popular. We do not use them for advertising, and nothing is sent to Google unless you accept. You can change your mind at any time with Cookie settings at the bottom of any page, which also removes those cookies.

## Your choices

You can see and change your details under Your account. To ask for a copy of your information, or to have your account removed, [contact us](/contact). We may keep order records for as long as the law requires.

## Changes

If we change this policy we will update this page.`,
  },
  "terms-and-conditions": {
    title: "Terms and conditions",
    description: "The terms for buying from this shop.",
    body: `By placing an order you agree to these terms.

## Orders and prices

Prices are in Indian rupees. Fabric is priced per metre and the price of your order depends on the length you choose. We may refuse or cancel an order if an item is out of stock or a price was shown wrongly, and we will refund anything you have paid.

## Payment

You pay online through Razorpay when you place the order. Your order is confirmed once the payment succeeds.

## Delivery

See [Shipping](/shipping-policy). Delivery times are estimates, not promises.

## Returns and refunds

See [Returns and refunds](/return-refund-policy). Fabric cut to your length cannot be returned.

## Colours

Colours on a screen can look different from the real fabric. Handloom and handmade fabrics can vary slightly from piece to piece; this is part of their character, not a fault.

## Reviews

You can review a product only after you have bought and received it. We may refuse a review that is abusive, unrelated or contains advertising.

## Your account

Keep your password private. You are responsible for what happens under your account.

## Our liability

We are responsible for delivering what you ordered in good condition. We are not liable for delays caused by couriers or events outside our control, beyond the value of your order.

## Law

These terms are governed by the laws of India.

## Contact

[Contact us](/contact) with any question about these terms.`,
  },
  faq: {
    title: "Questions and answers",
    description: "Quick answers about ordering, fabric, delivery and returns.",
    body: `## How do I order fabric by the metre?

Choose a colour on the product page, then the length you need. The price updates as you change the length. You can order in the steps shown, for example half a metre at a time.

## Can I return fabric?

Fabric is cut to your length, so it cannot be returned. Ready-made items can be returned within 7 days. See [Returns and refunds](/return-refund-policy).

## Do you deliver to my PIN code?

Enter your PIN code on any product page to check.

## How much is shipping?

A flat charge, free above a certain order value. The amount is shown in your bag.

## How can I pay?

Online through Razorpay: cards, UPI, net banking and wallets.

## Do I need an account?

You can fill your bag without one. You sign in or create an account to check out, so we can show your orders and tracking.

## How do I track my order?

Open it under Your account, or use [Track your order](/track-order).

## Can I change or cancel an order?

You can cancel a paid order yourself until we start preparing it. See [Returns and refunds](/return-refund-policy).

## Something is wrong with my order

[Contact us](/contact) with your order number.`,
  },
  about: {
    title: "About us",
    description: "Who we are and what we sell.",
    body: `Ambar sells fabrics and clothing chosen with care: cotton, crepe, modal silk, chinon and tissue by the metre, dupattas, blouses, ready-made kurtis and dresses, and unstitched suit sets.

We sell fabric by exactly the length you need, so you pay for what you use. Every order is cut, packed and sent from our own stock.

Tell us about your shop here: who you are, where you are, and what you care about in the cloth you sell. You can edit this page any time from the admin.`,
  },
  contact: {
    title: "Contact us",
    description: "How to reach us.",
    body: `We reply to messages within one working day.

For anything about an order, please include your order number.`,
  },
}
