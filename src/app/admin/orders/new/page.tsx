import { OfflineOrderForm } from "@/components/admin/offline-order-form"
import { PageTitle, staffPage } from "@/components/admin/staff-page"

export default staffPage<object>("orders:create_offline", async () => (
  <>
    <PageTitle
      title="Add order"
      crumbs={[{ label: "Orders", href: "/admin/orders" }, { label: "Add order" }]}
    />
    <p className="mb-6 max-w-2xl text-sm text-muted-foreground">
      Record a sale made in the shop. It is marked paid, the stock comes off straight away and a
      bill is ready to print.
    </p>
    <OfflineOrderForm />
  </>
))
