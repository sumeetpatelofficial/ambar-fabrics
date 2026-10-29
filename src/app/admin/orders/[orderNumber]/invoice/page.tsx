import { notFound } from "next/navigation"
import { Crumbs } from "@/components/admin/crumbs"
import { staffPage } from "@/components/admin/staff-page"
import { InvoiceDocument } from "@/components/invoice/invoice-document"
import { NotFoundError, ValidationError } from "@/lib/errors"
import { getInvoiceForStaff, type InvoiceData } from "@/services/invoice-service"

export default staffPage<{ params: Promise<{ orderNumber: string }> }>(
  "orders:read",
  async ({ actor, props }) => {
    const { orderNumber } = await props.params
    let invoice: InvoiceData | null = null
    let reason = ""
    try {
      invoice = await getInvoiceForStaff(actor, orderNumber)
    } catch (error) {
      if (error instanceof NotFoundError) notFound()
      if (!(error instanceof ValidationError)) throw error
      reason = error.message
    }
    return (
      <>
        <div className="print:hidden">
          <Crumbs
            trail={[
              { label: "Orders", href: "/admin/orders" },
              { label: orderNumber, href: `/admin/orders/${orderNumber}` },
              { label: "Invoice" },
            ]}
          />
        </div>
        {invoice ? (
          <InvoiceDocument invoice={invoice} />
        ) : (
          <p className="text-muted-foreground">{reason}</p>
        )}
      </>
    )
  }
)
