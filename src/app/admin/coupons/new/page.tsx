import { PageTitle, staffPage } from "@/components/admin/staff-page"
import { CouponForm } from "@/components/admin/other-forms"

export default staffPage<object>("coupons:manage", async () => (
  <>
    <PageTitle
      title="New coupon"
      crumbs={[{ label: "Coupons", href: "/admin/coupons" }, { label: "New coupon" }]}
    />
    <CouponForm values={{}} />
  </>
))
