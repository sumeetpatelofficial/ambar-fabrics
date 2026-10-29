import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { Package } from "lucide-react"
import { AccountSkeleton } from "@/components/account/account-skeleton"
import { buttonVariants } from "@/components/ui/button"
import { EmptyState } from "@/components/storefront/empty-state"
import { statusLabel } from "@/components/orders-status"
import { requireUser } from "@/lib/auth/session"
import { formatPaise } from "@/lib/money"
import { listOrdersForUser } from "@/services/order-service"

export const metadata: Metadata = { title: "Your orders" }

const date = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(
    new Date(iso)
  )

async function Content() {
  const user = await requireUser("/account/orders")
  const orders = await listOrdersForUser(user.id)
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-4xl">Your orders</h1>
      {orders.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No orders yet"
          description="When you place an order it will appear here, with its status and tracking."
          action={
            <Link href="/shop" className={buttonVariants()}>
              Start shopping
            </Link>
          }
        />
      ) : (
        <ul className="divide-y border-y">
          {orders.map((o) => (
            <li
              key={o.orderNumber}
              className="flex flex-wrap items-center justify-between gap-4 py-5"
            >
              <div>
                <h2 className="text-xl">
                  <Link
                    href={`/account/orders/${o.orderNumber}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {o.orderNumber}
                  </Link>
                </h2>
                <p className="text-sm text-muted-foreground">
                  {date(o.createdAt)}, {o.items.length} {o.items.length === 1 ? "item" : "items"}
                </p>
              </div>
              <p className="tabular text-right text-sm">
                <span className="block font-medium">{formatPaise(o.pricing.totalPaise)}</span>
                {statusLabel(o).label}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<AccountSkeleton />}>
      <Content />
    </Suspense>
  )
}
