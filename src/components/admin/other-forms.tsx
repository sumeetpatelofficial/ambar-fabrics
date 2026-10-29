"use client"

import { useRouter } from "next/navigation"
import { useActionState, useEffect } from "react"
import { FormMessage } from "@/components/forms/form-message"
import { SubmitButton } from "@/components/forms/submit-button"
import { TextField } from "@/components/forms/text-field"
import { AreaField, CheckField, SelectField } from "@/components/admin/fields"
import type { Option } from "@/components/admin/product-forms"
import {
  adjustStockAction,
  saveCategoryAction,
  saveCollectionAction,
  saveCouponAction,
  saveSettingsAction,
} from "@/features/admin/actions"
import type { FormValues } from "@/features/admin/mappers"
import { initialFormState } from "@/features/form-state"

export function CategoryForm({ values, categories }: { values: FormValues; categories: Option[] }) {
  const [state, action, pending] = useActionState(saveCategoryAction, initialFormState)
  const v = (k: string) => state.values?.[k] ?? values[k] ?? ""
  const e = state.fieldErrors ?? {}
  return (
    <form action={action} noValidate aria-label="Category" className="flex max-w-xl flex-col gap-5">
      <FormMessage state={state} />
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <TextField name="name" label="Name" required defaultValue={v("name")} error={e.name} />
      <TextField
        name="slug"
        label="Web address"
        defaultValue={v("slug")}
        error={e.slug}
        hint="Leave blank to make it from the name."
      />
      <SelectField
        name="parentId"
        label="Inside"
        defaultValue={v("parentId")}
        error={e.parentId}
        hint="Leave as top level, or choose the category this sits under."
      >
        <option value="">Top level</option>
        {categories.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </SelectField>
      <AreaField
        name="description"
        label="Description"
        defaultValue={v("description")}
        error={e.description}
        rows={3}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          name="sortOrder"
          label="Position"
          inputMode="numeric"
          defaultValue={v("sortOrder") || "0"}
          error={e.sortOrder}
          hint="Smaller numbers come first."
        />
        <SelectField name="status" label="Status" defaultValue={v("status") || "active"}>
          <option value="active">Shown</option>
          <option value="hidden">Hidden</option>
        </SelectField>
      </div>
      <div>
        <SubmitButton pending={pending} pendingLabel="Saving">
          Save category
        </SubmitButton>
      </div>
    </form>
  )
}

export function CollectionForm({
  values,
  categories,
}: {
  values: FormValues
  categories: Option[]
}) {
  const [state, action, pending] = useActionState(saveCollectionAction, initialFormState)
  const v = (k: string) => state.values?.[k] ?? values[k] ?? ""
  const e = state.fieldErrors ?? {}
  return (
    <form
      action={action}
      noValidate
      aria-label="Collection"
      className="flex max-w-xl flex-col gap-5"
    >
      <FormMessage state={state} />
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <TextField name="name" label="Name" required defaultValue={v("name")} error={e.name} />
      <TextField name="slug" label="Web address" defaultValue={v("slug")} error={e.slug} />
      <AreaField
        name="description"
        label="Description"
        defaultValue={v("description")}
        error={e.description}
        rows={3}
      />
      <SelectField name="type" label="How products are chosen" defaultValue={v("type") || "manual"}>
        <option value="manual">I pick them (by web address)</option>
        <option value="smart">By a rule</option>
      </SelectField>
      <AreaField
        name="productSlugs"
        label="Products (picked by hand)"
        defaultValue={v("productSlugs")}
        error={e.productSlugs}
        rows={4}
        hint="Product web addresses, one per line. Used when you pick by hand."
      />
      <fieldset className="grid gap-5 border p-4 sm:grid-cols-3">
        <legend className="px-1 text-sm">Rule (used when chosen by a rule)</legend>
        <TextField
          name="ruleTag"
          label="Has the tag"
          defaultValue={v("ruleTag")}
          error={e.ruleTag}
        />
        <SelectField name="ruleFlag" label="Or is marked" defaultValue={v("ruleFlag")}>
          <option value="">Nothing</option>
          <option value="featured">Featured</option>
          <option value="bestseller">Bestseller</option>
          <option value="newArrival">New arrival</option>
        </SelectField>
        <SelectField name="ruleCategoryId" label="Or is in" defaultValue={v("ruleCategoryId")}>
          <option value="">Nothing</option>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </SelectField>
      </fieldset>
      <SelectField name="status" label="Status" defaultValue={v("status") || "active"}>
        <option value="active">Shown</option>
        <option value="hidden">Hidden</option>
      </SelectField>
      <div>
        <SubmitButton pending={pending} pendingLabel="Saving">
          Save collection
        </SubmitButton>
      </div>
    </form>
  )
}

export function CouponForm({ values }: { values: FormValues }) {
  const [state, action, pending] = useActionState(saveCouponAction, initialFormState)
  const v = (k: string) => state.values?.[k] ?? values[k] ?? ""
  const e = state.fieldErrors ?? {}
  return (
    <form action={action} noValidate aria-label="Coupon" className="flex max-w-xl flex-col gap-5">
      <FormMessage state={state} />
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <TextField
        name="code"
        label="Code"
        required
        defaultValue={v("code")}
        error={e.code}
        hint="What the customer types. Letters, numbers, dashes."
      />
      <TextField
        name="description"
        label="Note for yourself"
        defaultValue={v("description")}
        error={e.description}
      />
      <SelectField name="type" label="Kind of discount" defaultValue={v("type") || "percent"}>
        <option value="percent">Percentage off</option>
        <option value="flat">Fixed amount off</option>
      </SelectField>
      <div className="grid gap-5 sm:grid-cols-3">
        <TextField
          name="percent"
          label="Percentage"
          inputMode="decimal"
          defaultValue={v("percent")}
          error={e.percent}
        />
        <TextField
          name="maxDiscount"
          label="At most (rupees)"
          inputMode="decimal"
          defaultValue={v("maxDiscount")}
          error={e.maxDiscount}
        />
        <TextField
          name="amount"
          label="Amount off (rupees)"
          inputMode="decimal"
          defaultValue={v("amount")}
          error={e.amount}
        />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          name="minOrder"
          label="Smallest order (rupees)"
          inputMode="decimal"
          defaultValue={v("minOrder")}
          error={e.minOrder}
        />
        <TextField
          name="perUserLimit"
          label="Uses per person"
          inputMode="numeric"
          defaultValue={v("perUserLimit") || "1"}
          error={e.perUserLimit}
        />
        <TextField
          name="startsAt"
          label="Starts"
          placeholder="2026-10-20"
          defaultValue={v("startsAt")}
          error={e.startsAt}
        />
        <TextField
          name="endsAt"
          label="Ends"
          placeholder="2026-11-05"
          defaultValue={v("endsAt")}
          error={e.endsAt}
        />
        <TextField
          name="usageLimit"
          label="Total uses allowed"
          inputMode="numeric"
          defaultValue={v("usageLimit")}
          error={e.usageLimit}
          hint="Leave blank for unlimited."
        />
      </div>
      <CheckField
        name="active"
        label="Active"
        defaultChecked={values.id ? Boolean(v("active")) : true}
      />
      <CheckField
        name="showOnHome"
        label="Show on the home page"
        defaultChecked={Boolean(v("showOnHome"))}
        hint="Shown as the festive offer, with its code, discount, end date and smallest order. Only one coupon is shown: ticking this takes it off any other. It disappears by itself when the coupon ends, is switched off or is used up."
      />
      <div>
        <SubmitButton pending={pending} pendingLabel="Saving">
          Save coupon
        </SubmitButton>
      </div>
    </form>
  )
}

export function SettingsForm({ values }: { values: FormValues }) {
  const [state, action, pending] = useActionState(saveSettingsAction, initialFormState)
  const v = (k: string) => state.values?.[k] ?? values[k] ?? ""
  const e = state.fieldErrors ?? {}
  return (
    <form
      action={action}
      noValidate
      aria-label="Store settings"
      className="flex max-w-xl flex-col gap-5"
    >
      <FormMessage state={state} />
      <TextField
        name="storeName"
        label="Shop name"
        required
        defaultValue={v("storeName")}
        error={e.storeName}
      />
      <fieldset className="flex flex-col gap-4 border p-4">
        <legend className="px-1 text-sm">Contact details (shown on the Contact page)</legend>
        <TextField
          name="storeEmail"
          label="Email"
          type="email"
          defaultValue={v("storeEmail")}
          error={e.storeEmail}
          hint="Messages from the contact form are sent here. Without it the form is hidden."
        />
        <TextField
          name="legalName"
          label="Business name for invoices"
          defaultValue={v("legalName")}
          error={e.legalName}
          hint="The name printed on invoices. Leave blank to use the shop name."
        />
        <TextField
          name="gstin"
          label="GSTIN (once you are registered)"
          defaultValue={v("gstin")}
          error={e.gstin}
          hint="Leave blank while you are not GST-registered: invoices are then a Bill of Supply with no GST."
        />
        <TextField
          name="storePhone"
          label="Phone"
          defaultValue={v("storePhone")}
          error={e.storePhone}
        />
        <AreaField
          name="storeAddress"
          label="Address"
          defaultValue={v("storeAddress")}
          rows={3}
          hint="One line per row."
        />
      </fieldset>
      <fieldset className="grid gap-5 border p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm">Shipping charged to customers</legend>
        <TextField
          name="flatShipping"
          label="Flat charge (rupees)"
          inputMode="decimal"
          defaultValue={v("flatShipping")}
          error={e.flatShipping}
        />
        <TextField
          name="freeShippingFrom"
          label="Free from (rupees)"
          inputMode="decimal"
          defaultValue={v("freeShippingFrom")}
          error={e.freeShippingFrom}
          hint="Leave blank to always charge."
        />
      </fieldset>
      <fieldset className="grid gap-5 border p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm">Orders</legend>
        <TextField
          name="returnWindowDays"
          label="Return window (days)"
          inputMode="numeric"
          defaultValue={v("returnWindowDays")}
          error={e.returnWindowDays}
          hint="After delivery. Fabric cut to length is never returnable."
        />
        <TextField
          name="reservationMinutes"
          label="Hold stock while paying (minutes)"
          inputMode="numeric"
          defaultValue={v("reservationMinutes")}
          error={e.reservationMinutes}
        />
      </fieldset>
      <fieldset className="grid gap-5 border p-4 sm:grid-cols-3">
        <legend className="px-1 text-sm">GST</legend>
        <div className="sm:col-span-3">
          <CheckField
            name="taxEnabled"
            label="Prices include or add GST"
            defaultChecked={Boolean(v("taxEnabled"))}
            hint="Leave off until you are GST-registered."
          />
        </div>
        <SelectField name="taxMode" label="Prices are" defaultValue={v("taxMode") || "inclusive"}>
          <option value="inclusive">GST-inclusive</option>
          <option value="exclusive">Before GST (added at checkout)</option>
        </SelectField>
        <TextField
          name="taxRate"
          label="Usual rate (%)"
          inputMode="decimal"
          defaultValue={v("taxRate")}
          error={e.taxRate}
        />
      </fieldset>
      <fieldset className="flex flex-col gap-4 border p-4">
        <legend className="px-1 text-sm">Announcement bar</legend>
        <CheckField
          name="announcementEnabled"
          label="Show the bar"
          defaultChecked={Boolean(v("announcementEnabled"))}
        />
        <TextField
          name="announcementText"
          label="Message"
          defaultValue={v("announcementText")}
          error={e.announcementText}
        />
        <TextField
          name="announcementHref"
          label="Link (a page on this site)"
          placeholder="/sale"
          defaultValue={v("announcementHref")}
          error={e.announcementHref}
        />
      </fieldset>
      <div>
        <SubmitButton pending={pending} pendingLabel="Saving">
          Save settings
        </SubmitButton>
      </div>
    </form>
  )
}

/** One form per stock row. The key makes a double click change the stock once. */
export function StockForm({ variantId, unitHint }: { variantId: string; unitHint: string }) {
  const router = useRouter()
  const [state, action, pending] = useActionState(adjustStockAction, initialFormState)
  useEffect(() => {
    if (state.status === "success") router.refresh()
  }, [state, router])
  const e = state.fieldErrors ?? {}
  return (
    <form
      action={action}
      // Each submit gets its own one-time key just before sending, so a repeated delivery changes the stock once.
      onSubmit={(e) => {
        const field = e.currentTarget.elements.namedItem("key")
        if (field instanceof HTMLInputElement) field.value = crypto.randomUUID()
      }}
      noValidate
      aria-label="Change stock"
      className="flex flex-col gap-3 border p-4"
    >
      <FormMessage state={state} />
      <input type="hidden" name="variantId" value={variantId} />
      <input type="hidden" name="key" defaultValue="" />
      <div className="grid gap-3 sm:grid-cols-3">
        <SelectField name="mode" label="Change" defaultValue="add">
          <option value="add">Add stock</option>
          <option value="remove">Remove (damaged, lost)</option>
          <option value="set">Set to an exact amount</option>
        </SelectField>
        <TextField
          name="amount"
          label={`Amount (${unitHint})`}
          inputMode="decimal"
          error={e.amount}
        />
        <TextField name="reason" label="Reason" error={e.reason} />
      </div>
      <div>
        <SubmitButton pending={pending} pendingLabel="Saving" size="default">
          Update stock
        </SubmitButton>
      </div>
    </form>
  )
}
