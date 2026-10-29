import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { AccountSkeleton } from "@/components/account/account-skeleton"
import { InvoiceDocument } from "@/components/invoice/invoice-document"
import { requireUser } from "@/lib/auth/session"
import { NotFoundError, ValidationError } from "@/lib/errors"
import { getInvoiceForUser, type InvoiceData } from "@/services/invoice-service"

export const metadata: Metadata = { title: "Invoice", robots: { index: false, follow: false } }

async function Content({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params
  const user = await requireUser(`/account/orders/${orderNumber}/invoice`)
  let invoice: InvoiceData | null = null
  let reason = ""
  try {
    invoice = await getInvoiceForUser(user.id, orderNumber)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    if (!(error instanceof ValidationError)) throw error
    reason = error.message
  }
  const back = (
    <Link href={`/account/orders/${orderNumber}`} className="underline underline-offset-4">
      Back to the order
    </Link>
  )
  if (!invoice)
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl">No invoice yet</h1>
        <p className="text-muted-foreground">{reason}</p>
        {back}
      </div>
    )
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm print:hidden">{back}</p>
      <InvoiceDocument invoice={invoice} />
    </div>
  )
}

export default function InvoicePage(props: { params: Promise<{ orderNumber: string }> }) {
  return (
    <Suspense fallback={<AccountSkeleton />}>
      <Content {...props} />
    </Suspense>
  )
}
