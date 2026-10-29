import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { TrackPurchase } from "@/components/analytics/track-events"
import { AccountSkeleton } from "@/components/account/account-skeleton"
import { OrderPayActions } from "@/components/checkout/order-pay-actions"
import { CancelOrder, ReturnForm } from "@/components/orders/order-customer-actions"
import { OrderTracking } from "@/components/orders/order-tracking"
import { statusLabel } from "@/components/orders-status"
import { siteDefaults } from "@/config/site"
import { requireUser } from "@/lib/auth/session"
import { formatQuantity } from "@/lib/measure"
import { formatPaise } from "@/lib/money"
import { getOrderDetail } from "@/services/order-detail-service"

export const metadata: Metadata = { title: "Order", robots: { index: false, follow: false } }

async function Content({
  params,
  searchParams,
}: {
  params: Promise<{ orderNumber: string }>
  searchParams: Promise<{ paid?: string }>
}) {
  const { orderNumber } = await params
  const { paid } = await searchParams
  const user = await requireUser(`/account/orders/${orderNumber}`)
  const order = await getOrderDetail(user.id, orderNumber)
  if (!order) notFound()
  const status = statusLabel(order)
  const a = order.shippingAddress
  const justPaid = paid === "1" && order.paymentStatus === "paid"

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-sm">
          <Link href="/account/orders" className="underline underline-offset-4">
            All orders
          </Link>
        </p>
        <h1 className="mt-2 text-4xl">Order {order.orderNumber}</h1>
        <p className="mt-1 text-muted-foreground">{status.label}</p>
      </div>

      {justPaid ? (
        <TrackPurchase
          orderNumber={order.orderNumber}
          valuePaise={order.pricing.totalPaise}
          taxPaise={order.pricing.taxPaise}
          shippingPaise={order.pricing.shippingPaise}
          coupon={order.couponCode}
          // Only what analytics needs: the order's items also carry what the shop paid for them.
          lines={order.items.map((i) => ({
            slug: i.slug,
            name: i.name,
            colorName: i.colorName,
            size: i.size,
            unit: i.unit,
            qty: i.qty,
            unitPricePaise: i.unitPricePaise,
            discountPaise: i.discountPaise,
          }))}
        />
      ) : null}
      {justPaid ? (
        <p role="status" className="border border-primary/40 bg-primary/5 p-4">
          Thank you. Your payment is confirmed and we are getting your order ready. A confirmation
          has been sent to {user.email}.
        </p>
      ) : null}
      {order.status === "pending_payment" ? (
        <OrderPayActions
          orderNumber={order.orderNumber}
          totalPaise={order.pricing.totalPaise}
          siteName={siteDefaults.name}
        />
      ) : null}
      {order.status === "needs_attention" ? (
        <p role="status" className="border p-4">
          Something needed a closer look with this order. If you paid, the amount is being returned
          to you. Please contact us if you have questions.
        </p>
      ) : null}

      {["paid", "partially_refunded", "refunded"].includes(order.paymentStatus) ? (
        <p>
          <Link
            href={`/account/orders/${order.orderNumber}/invoice`}
            className="underline underline-offset-4"
          >
            View or print your invoice
          </Link>
        </p>
      ) : null}
      {order.canCancel ? <CancelOrder orderNumber={order.orderNumber} /> : null}
      {order.shipment ? <OrderTracking shipment={order.shipment} /> : null}

      <ul className="divide-y border-y">
        {order.items.map((i) => (
          <li key={i.variantId} className="flex justify-between gap-4 py-4">
            <div>
              <h2 className="text-lg">
                <Link href={`/products/${i.slug}`} className="underline-offset-4 hover:underline">
                  {i.name}
                </Link>
              </h2>
              <p className="text-sm text-muted-foreground">
                {[i.colorName, i.size].filter(Boolean).join(", ")}
                {i.colorName || i.size ? ", " : ""}
                {formatQuantity(i.unit, i.qty)}
              </p>
            </div>
            <p className="tabular">{formatPaise(i.linePaise)}</p>
          </li>
        ))}
      </ul>

      <div className="grid gap-8 sm:grid-cols-2">
        <section aria-labelledby="addr">
          <h2 id="addr" className="text-xl">
            Delivering to
          </h2>
          <p className="mt-2 text-sm leading-relaxed">
            {a.fullName}
            <br />
            {[a.line1, a.line2, a.landmark].filter(Boolean).join(", ")}
            <br />
            {a.city}, {a.state} {a.pincode}
            <br />
            Phone {a.phone}
          </p>
        </section>
        <section aria-labelledby="totals">
          <h2 id="totals" className="text-xl">
            Payment
          </h2>
          <dl className="tabular mt-2 flex flex-col gap-1 text-sm">
            <Row label="Subtotal" value={formatPaise(order.pricing.subtotalPaise)} />
            {order.pricing.discountPaise > 0 ? (
              <Row
                label={`Discount${order.couponCode ? ` (${order.couponCode})` : ""}`}
                value={`-${formatPaise(order.pricing.discountPaise)}`}
              />
            ) : null}
            <Row
              label="Shipping"
              value={
                order.pricing.shippingPaise === 0
                  ? "Free"
                  : formatPaise(order.pricing.shippingPaise)
              }
            />
            {order.pricing.taxExclusive ? (
              <Row label="Tax" value={formatPaise(order.pricing.taxPaise)} />
            ) : null}
            <div className="flex justify-between gap-4 border-t pt-2 text-base font-medium">
              <dt>Total</dt>
              <dd>{formatPaise(order.pricing.totalPaise)}</dd>
            </div>
            {order.refundedPaise > 0 ? (
              <Row label="Refunded" value={formatPaise(order.refundedPaise)} />
            ) : null}
          </dl>
        </section>
      </div>

      {order.returns.length > 0 ? (
        <section aria-labelledby="returns" className="flex flex-col gap-3">
          <h2 id="returns" className="text-xl">
            Returns
          </h2>
          <ul className="flex flex-col gap-2 text-sm">
            {order.returns.map((r) => (
              <li key={r.id} className="border p-3">
                <span className="font-medium">{RETURN_LABEL[r.status]}</span>
                {r.refundAmountPaise ? `, ${formatPaise(r.refundAmountPaise)} refunded` : ""}
                <span className="block text-muted-foreground">{r.reason}</span>
                {r.decisionNote ? <span className="block">Our reply: {r.decisionNote}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {order.returnable.length > 0 ? (
        <ReturnForm
          orderNumber={order.orderNumber}
          items={order.returnable}
          endsOn={order.returnWindowEnds}
        />
      ) : null}
    </div>
  )
}

const RETURN_LABEL = {
  requested: "Return requested",
  approved: "Return approved, please send the items back",
  rejected: "Return not accepted",
  received: "Return received",
  refunded: "Return refunded",
} as const

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

export default function OrderPage(props: {
  params: Promise<{ orderNumber: string }>
  searchParams: Promise<{ paid?: string }>
}) {
  return (
    <Suspense fallback={<AccountSkeleton />}>
      <Content {...props} />
    </Suspense>
  )
}
