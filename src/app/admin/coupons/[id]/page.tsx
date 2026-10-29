import { notFound } from "next/navigation"
import { PageTitle, staffPage } from "@/components/admin/staff-page"
import { CouponForm } from "@/components/admin/other-forms"
import { couponToForm } from "@/features/admin/mappers"
import { NotFoundError } from "@/lib/errors"
import { getCoupon } from "@/services/admin-ops-service"

export default staffPage<{ params: Promise<{ id: string }> }>(
  "coupons:manage",
  async ({ actor, props }) => {
    const { id } = await props.params
    try {
      const coupon = await getCoupon(actor, id)
      return (
        <>
          <PageTitle
            title={coupon.code}
            crumbs={[{ label: "Coupons", href: "/admin/coupons" }, { label: coupon.code }]}
          />
          <CouponForm values={couponToForm(coupon)} />
        </>
      )
    } catch (error) {
      if (error instanceof NotFoundError) notFound()
      throw error
    }
  }
)
