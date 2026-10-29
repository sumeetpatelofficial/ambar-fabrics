import Link from "next/link"
import { Crumbs } from "@/components/admin/crumbs"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { AdminOrderActions } from "@/components/admin/order-actions"
import { RefundForm, VoidSaleForm } from "@/components/admin/row-actions"
import { roleHasPermission } from "@/config/permissions"
import { listPaymentsForOrder } from "@/services/admin-ops-service"
import { paiseToRupeeString } from "@/lib/money"
import { OrderTracking } from "@/components/orders/order-tracking"
import { statusLabel } from "@/components/orders-status"
import { requireStaffPage, toActor } from "@/lib/auth/session"
import { NotFoundError } from "@/lib/errors"
import { formatQuantity } from "@/lib/measure"
import { formatPaise } from "@/lib/money"
import { getOrderDetailForStaff } from "@/services/order-detail-service"

async function Content({ params }: { params: Promise<{ orderNumber: string }> }) {
  const user = await requireStaffPage("orders:read")
  const { orderNumber } = await params
  let order
  try {
    order = await getOrderDetailForStaff(toActor(user), orderNumber)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }
  const a = order.shippingAddress
  const canSeePayments = roleHasPermission(user.role, "payments:read")
  const money = canSeePayments ? await listPaymentsForOrder(toActor(user), orderNumber) : null
  const refundable = order.pricing.totalPaise - order.refundedPaise
  const inStore = order.channel === "store"
  const methodName = { cash: "cash", upi: "UPI", card: "card" }
  const active =
    order.shipment && !["delivered", "cancelled", "rto_delivered"].includes(order.shipment.status)
  return (
    <div className="flex flex-col gap-8 rounded-xl border bg-background p-5 sm:p-8">
      <div>
        <Crumbs
          trail={[{ label: "Orders", href: "/admin/orders" }, { label: order.orderNumber }]}
        />
        <h1 className="mt-2 text-4xl">Order {order.orderNumber}</h1>
        <p className="mt-1 text-muted-foreground">
          {statusLabel(order).label},{" "}
          {inStore
            ? `sold in the shop${order.paymentMethod ? `, paid by ${methodName[order.paymentMethod]}` : ""}`
            : order.email}
        </p>
      </div>
      {order.paymentStatus !== "unpaid" ? (
        <p className="text-sm">
          <Link
            href={`/admin/orders/${order.orderNumber}/invoice`}
            className="underline underline-offset-4"
          >
            Open the invoice
          </Link>
        </p>
      ) : null}
      {inStore &&
      order.status === "completed" &&
      roleHasPermission(user.role, "orders:create_offline") ? (
        <VoidSaleForm orderNumber={order.orderNumber} />
      ) : null}
      {inStore ? null : (
        <AdminOrderActions
          orderNumber={order.orderNumber}
          canBook={
            order.paymentStatus === "paid" &&
            ["confirmed", "processing"].includes(order.status) &&
            !active &&
            order.fulfillmentStatus === "unfulfilled"
          }
          canCancelShipment={order.shipment?.status === "created"}
          canCancelOrder={
            order.paymentStatus === "paid" &&
            ["confirmed", "processing"].includes(order.status) &&
            (!order.shipment || order.shipment.status === "cancelled")
          }
          returns={order.returns.map((r) => ({ id: r.id, status: r.status, reason: r.reason }))}
        />
      )}
      {order.shipment ? (
        <>
          <OrderTracking shipment={order.shipment} />
          {order.shipment.labelUrl ? (
            <p className="text-sm">
              <a
                href={order.shipment.labelUrl}
                rel="noopener noreferrer"
                target="_blank"
                className="underline underline-offset-4"
              >
                Open shipping label
              </a>
            </p>
          ) : null}
        </>
      ) : null}
      <ul className="divide-y border-y">
        {order.items.map((i) => (
          <li key={i.variantId} className="flex justify-between gap-4 py-3 text-sm">
            <span>
              {i.name} ({i.sku})
              <span className="block text-muted-foreground">{formatQuantity(i.unit, i.qty)}</span>
            </span>
            <span className="tabular">{formatPaise(i.linePaise)}</span>
          </li>
        ))}
      </ul>
      {inStore ? (
        <p className="text-sm leading-relaxed">
          {a.fullName}
          {a.phone ? `, phone ${a.phone}` : ""}
        </p>
      ) : (
        <p className="text-sm leading-relaxed">
          {a.fullName}, {[a.line1, a.line2, a.landmark].filter(Boolean).join(", ")}, {a.city},{" "}
          {a.state} {a.pincode}, phone {a.phone}
        </p>
      )}
      {money ? (
        <section aria-labelledby="payments" className="flex flex-col gap-2 text-sm">
          <h2 id="payments" className="text-xl">
            Payments
          </h2>
          {money.payments.map((p) => (
            <p key={String(p._id)} className="tabular">
              {p.gateway}: {p.status}, {formatPaise(p.amountPaise)}
              {p.gatewayPaymentId ? `, ${p.gatewayPaymentId}` : ""}
            </p>
          ))}
          {money.refunds.map((r) => (
            <p key={String(r._id)} className="tabular text-muted-foreground">
              Refund {r.status}: {formatPaise(r.amountPaise)}, {r.reason}
            </p>
          ))}
        </section>
      ) : null}
      {!inStore &&
      roleHasPermission(user.role, "refunds:create") &&
      order.paymentStatus !== "unpaid" &&
      refundable > 0 ? (
        <RefundForm orderNumber={order.orderNumber} maxRupees={paiseToRupeeString(refundable)} />
      ) : null}
      <p className="tabular text-sm">
        Total {formatPaise(order.pricing.totalPaise)}
        {order.refundedPaise > 0 ? `, refunded ${formatPaise(order.refundedPaise)}` : ""}
      </p>
    </div>
  )
}

export default function AdminOrderPage(props: { params: Promise<{ orderNumber: string }> }) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <Content {...props} />
    </Suspense>
  )
}
