"use client"

import { useRouter } from "next/navigation"
import { useActionState, useEffect, useId, useState } from "react"
import { FormMessage } from "@/components/forms/form-message"
import { SubmitButton } from "@/components/forms/submit-button"
import { TextField } from "@/components/forms/text-field"
import { AreaField, CheckField, SelectField } from "@/components/admin/fields"
import { ImageUploader } from "@/components/admin/image-uploader"
import { createProductAction, saveProductAction, saveVariantAction } from "@/features/admin/actions"
import { ProfitPreview, VariantRows } from "@/components/admin/variant-rows"
import type { FormValues } from "@/features/admin/mappers"
import { initialFormState, type FormState } from "@/features/form-state"

export type Option = { value: string; label: string }

function useValues(state: FormState, initial: FormValues) {
  return (k: string) => state.values?.[k] ?? initial[k] ?? ""
}

/** After a successful save of something already on screen, re-read it from the server. */
function useRefreshOnSuccess(state: FormState) {
  const router = useRouter()
  useEffect(() => {
    if (state.status === "success") router.refresh()
  }, [state, router])
}

export function ProductForm({
  values,
  productId,
  categories,
  fabrics = [],
  prints = [],
  showCost = false,
}: {
  values: FormValues
  productId?: string
  categories: Option[]
  fabrics?: Option[]
  prints?: Option[]
  /** The person may see purchase prices and profit: the new-product form then asks for them. */
  showCost?: boolean
}) {
  // A new product is made together with its first colours; an existing one is edited on its own.
  const [state, action, pending] = useActionState(
    productId ? saveProductAction : createProductAction,
    initialFormState
  )
  const v = useValues(state, values)
  const e = state.fieldErrors ?? {}
  const [images, setImages] = useState<string | null>(null)
  const imageText = images ?? v("images")
  const [name, setName] = useState(values.name ?? "")
  useRefreshOnSuccess(state)
  return (
    <form
      action={action}
      noValidate
      aria-label={productId ? "Edit product" : "New product"}
      className="flex max-w-3xl flex-col gap-5"
    >
      <FormMessage state={state} />
      {productId ? <input type="hidden" name="id" value={productId} /> : null}
      <TextField
        name="name"
        label="Name"
        required
        defaultValue={v("name")}
        error={e.name}
        onChange={(ev) => setName(ev.target.value)}
      />
      <TextField
        name="slug"
        label="Web address"
        defaultValue={v("slug")}
        error={e.slug}
        hint="Leave blank to make it from the name. Changing a live address keeps the old link working."
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          key={`category-${v("categoryId")}`}
          name="categoryId"
          label="Category"
          defaultValue={v("categoryId")}
          error={e.categoryId}
          required
        >
          <option value="">Choose a category</option>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </SelectField>
        <SelectField
          key={`status-${v("status")}`}
          name="status"
          label="Status"
          defaultValue={v("status") || "draft"}
          hint="Only active products appear in the shop."
        >
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </SelectField>
      </div>
      <TextField
        name="shortDescription"
        label="Short description"
        defaultValue={v("shortDescription")}
        error={e.shortDescription}
      />
      <AreaField
        name="description"
        label="Description"
        defaultValue={v("description")}
        error={e.description}
        rows={6}
        hint="A blank line starts a new paragraph."
      />
      <TextField
        name="tags"
        label="Tags"
        defaultValue={v("tags")}
        error={e.tags}
        hint="Separated by commas, like monsoon, festive."
      />
      <fieldset className="flex flex-col gap-3 border p-4">
        <legend className="px-1 text-sm">Highlights and returns</legend>
        <CheckField
          name="featured"
          label="Featured on the home page"
          defaultChecked={Boolean(v("featured"))}
        />
        <CheckField
          name="bestseller"
          label="Bestseller"
          defaultChecked={Boolean(v("bestseller"))}
        />
        <CheckField
          name="newArrival"
          label="New arrival (for 30 days)"
          defaultChecked={Boolean(v("newArrival"))}
        />
        <CheckField
          name="returnable"
          label="Can be returned"
          defaultChecked={Boolean(v("returnable"))}
          hint="Fabric sold by length is never returnable, whatever this says."
        />
      </fieldset>
      <fieldset className="grid gap-5 border p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm">Fabric details</legend>
        <SelectField
          key={`fabric-${v("fabricId")}`}
          name="fabricId"
          label="Fabric"
          defaultValue={v("fabricId")}
          error={e.fabricId}
          hint="From your master fabrics. The same fabric can be used by any product."
        >
          <option value="">Not set</option>
          {fabrics.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </SelectField>
        <TextField
          name="material"
          label="Material"
          defaultValue={v("material")}
          error={e.material}
        />
        <SelectField
          key={`print-${v("printId")}`}
          name="printId"
          label="Print or type"
          defaultValue={v("printId")}
          error={e.printId}
          hint="Bandhani, Ajrakh, block print and so on. Plain cloth has none."
        >
          <option value="">None</option>
          {prints.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </SelectField>
        <TextField
          name="widthCm"
          label="Width (cm)"
          inputMode="numeric"
          defaultValue={v("widthCm")}
          error={e.widthCm}
        />
        <TextField
          name="composition"
          label="Composition"
          defaultValue={v("composition")}
          error={e.composition}
        />
        <TextField name="origin" label="Origin" defaultValue={v("origin")} error={e.origin} />
        <TextField
          name="occasion"
          label="Occasions"
          defaultValue={v("occasion")}
          error={e.occasion}
          hint="Separated by commas."
        />
        <div className="sm:col-span-2">
          <AreaField
            name="careInstructions"
            label="Care instructions"
            defaultValue={v("careInstructions")}
            rows={3}
            hint="One per line."
          />
        </div>
      </fieldset>
      {productId ? null : (
        <VariantRows
          showCost={showCost}
          values={state.values ?? {}}
          errors={state.fieldErrors ?? {}}
        />
      )}
      <ImageUploader
        productName={name}
        onUploaded={(lines) => setImages([imageText.trim(), ...lines].filter(Boolean).join("\n"))}
      />
      <AreaField
        name="images"
        label="Photographs"
        value={imageText}
        onChange={(ev) => setImages(ev.target.value)}
        error={e.images}
        rows={4}
        hint="One per line: the Cloudinary address, then | and a description for people who cannot see the picture. The first is the main photograph."
      />
      <fieldset className="grid gap-5 border p-4 sm:grid-cols-3">
        <legend className="px-1 text-sm">Tax and weight (optional)</legend>
        <TextField name="hsnCode" label="HSN code" defaultValue={v("hsnCode")} error={e.hsnCode} />
        <TextField
          name="taxRatePercent"
          label="Tax rate (%)"
          inputMode="decimal"
          defaultValue={v("taxRatePercent")}
          error={e.taxRatePercent}
        />
        <TextField
          name="weightGrams"
          label="Weight (g)"
          inputMode="numeric"
          defaultValue={v("weightGrams")}
          error={e.weightGrams}
          hint="Per metre for fabric, per piece otherwise."
        />
      </fieldset>
      <TextField
        name="seoTitle"
        label="Search result title (optional)"
        defaultValue={v("seoTitle")}
        error={e.seoTitle}
      />
      <AreaField
        name="seoDescription"
        label="Search result description (optional)"
        defaultValue={v("seoDescription")}
        error={e.seoDescription}
        rows={2}
      />
      <div>
        <SubmitButton pending={pending} pendingLabel="Saving">
          {productId ? "Save product" : "Create product"}
        </SubmitButton>
      </div>
    </form>
  )
}

export function VariantForm({
  productId,
  values,
  isNew,
  showCost = false,
}: {
  productId: string
  values: FormValues
  isNew?: boolean
  showCost?: boolean
}) {
  const [state, action, pending] = useActionState(saveVariantAction, initialFormState)
  const v = useValues(state, values)
  const [price, setPrice] = useState(v("price"))
  const [cost, setCost] = useState(v("purchasePrice"))
  const [kind, setKind] = useState(v("kind") || "length")
  const e = state.fieldErrors ?? {}
  const uid = useId()
  useRefreshOnSuccess(state)
  return (
    <form
      action={action}
      noValidate
      aria-label={isNew ? "Add a variant" : `Edit ${values.sku}`}
      className="flex flex-col gap-4"
    >
      <FormMessage state={state} />
      <input type="hidden" name="productId" value={productId} />
      {values.variantId ? <input type="hidden" name="variantId" value={values.variantId} /> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField name="sku" label="SKU" required defaultValue={v("sku")} error={e.sku} />
        <TextField
          name="colorName"
          label="Colour name"
          defaultValue={v("colorName")}
          error={e.colorName}
        />
        <TextField
          name="colorHex"
          label="Colour code"
          placeholder="#4b5e45"
          defaultValue={v("colorHex")}
          error={e.colorHex}
        />
        <TextField name="size" label="Size" defaultValue={v("size")} error={e.size} />
        <SelectField
          name="kind"
          label="Sold by"
          value={kind}
          onChange={(v) => setKind(v)}
          error={e.kind}
        >
          <option value="length">Length (metres)</option>
          <option value="piece">Piece</option>
          <option value="set">Set</option>
          <option value="pair">Pair</option>
          <option value="pack">Pack</option>
        </SelectField>
        <SelectField name="status" label="Status" defaultValue={v("status") || "active"}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </SelectField>
      </div>
      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm">Price in rupees (per metre for fabric)</legend>
        <TextField
          name="price"
          label="Selling price"
          inputMode="decimal"
          required
          value={price}
          onChange={(ev) => setPrice(ev.target.value)}
          error={e.price}
        />
        {showCost ? (
          <TextField
            name="purchasePrice"
            label="Purchase price"
            inputMode="decimal"
            value={cost}
            onChange={(ev) => setCost(ev.target.value)}
            error={e.purchasePrice}
            hint="What you paid. Only owners and admins see this."
          />
        ) : null}
        <TextField
          name="compareAt"
          label="Original price (struck through)"
          inputMode="decimal"
          defaultValue={v("compareAt")}
          error={e.compareAt}
        />
        <TextField
          name="salePrice"
          label="Sale price"
          inputMode="decimal"
          defaultValue={v("salePrice")}
          error={e.salePrice}
        />
        <TextField
          name="saleStartsAt"
          label="Sale starts"
          placeholder="2026-10-31"
          defaultValue={v("saleStartsAt")}
          error={e.saleStartsAt}
        />
        <TextField
          name="saleEndsAt"
          label="Sale ends"
          placeholder="2026-11-05"
          defaultValue={v("saleEndsAt")}
          error={e.saleEndsAt}
        />
      </fieldset>
      {showCost ? (
        <ProfitPreview
          price={price}
          cost={cost}
          stock=""
          kind={kind as "length" | "piece" | "set" | "pair" | "pack"}
        />
      ) : null}
      <fieldset className="grid gap-4 sm:grid-cols-4">
        <legend className="mb-2 text-sm">
          Ordering rules (in metres for fabric, otherwise in pieces)
        </legend>
        <TextField
          name="minQty"
          label="Smallest order"
          defaultValue={v("minQty")}
          error={e.minQty}
        />
        <TextField name="stepQty" label="Steps of" defaultValue={v("stepQty")} error={e.stepQty} />
        <TextField
          name="maxQty"
          label="Largest order"
          defaultValue={v("maxQty")}
          error={e.maxQty}
        />
        <TextField
          name="lowStock"
          label="Low-stock warning at"
          defaultValue={v("lowStock")}
          error={e.lowStock}
        />
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-3">
        {isNew ? (
          <TextField
            name="initialStock"
            label="Stock to start with"
            defaultValue={v("initialStock")}
            error={e.initialStock}
            hint="Change it later on the Inventory page."
          />
        ) : null}
        <TextField
          name="weightGrams"
          label="Weight (g)"
          inputMode="numeric"
          defaultValue={v("weightGrams")}
          error={e.weightGrams}
        />
      </div>
      <div>
        <SubmitButton pending={pending} pendingLabel="Saving" id={`${uid}-save`}>
          {isNew ? "Add variant" : "Save variant"}
        </SubmitButton>
      </div>
    </form>
  )
}
