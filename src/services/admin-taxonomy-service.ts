import "server-only"
import mongoose from "mongoose"
import { connectDb } from "@/lib/db/mongoose"
import { NotFoundError, ValidationError } from "@/lib/errors"
import { assertPermission, type Actor } from "@/lib/security/authorize"
import { slugify } from "@/lib/slug"
import { Product } from "@/models/product"
import { Taxon, TAXON_KINDS, type TaxonDoc, type TaxonKind } from "@/models/taxon"
import { recordAudit } from "@/services/audit-service"

const trusted = mongoose.trusted
const oid = (id: string) => new mongoose.Types.ObjectId(id)
const fieldError = (path: string, issue: string) =>
  new ValidationError("Please check the highlighted fields.", [{ path, issue }])

export const KIND_LABEL: Record<
  TaxonKind,
  { one: string; many: string; field: "fabricId" | "printId"; attr: "fabricType" | "pattern" }
> = {
  fabric: { one: "fabric", many: "fabrics", field: "fabricId", attr: "fabricType" },
  print: { one: "print", many: "prints", field: "printId", attr: "pattern" },
}

const assertKind = (kind: string): TaxonKind => {
  if (!(TAXON_KINDS as readonly string[]).includes(kind)) throw new NotFoundError()
  return kind as TaxonKind
}

/** "gaji silk" -> "Gaji silk": the first letter up, the rest as typed. */
export const tidyName = (name: string) => {
  const t = name.trim().replace(/\s+/g, " ")
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export type TaxonRow = {
  id: string
  name: string
  slug: string
  status: TaxonDoc["status"]
  sortOrder: number
  products: number
  description?: string
}

export async function listTaxa(actor: Actor, kind: TaxonKind): Promise<TaxonRow[]> {
  assertPermission(actor, "catalog:read")
  assertKind(kind)
  await connectDb()
  const taxa = await Taxon.find({ kind }).sort({ sortOrder: 1, name: 1 }).lean<TaxonDoc[]>()
  const field = KIND_LABEL[kind].field
  const counts = await Product.aggregate<{ _id: mongoose.Types.ObjectId; n: number }>([
    { $match: { [field]: { $in: taxa.map((t) => t._id) } } },
    { $group: { _id: `$${field}`, n: { $sum: 1 } } },
  ])
  const byId = new Map(counts.map((c) => [String(c._id), c.n]))
  return taxa.map((t) => ({
    id: String(t._id),
    name: t.name,
    slug: t.slug,
    status: t.status,
    sortOrder: t.sortOrder,
    products: byId.get(String(t._id)) ?? 0,
    description: t.description,
  }))
}

export async function getTaxon(actor: Actor, id: string): Promise<TaxonDoc> {
  assertPermission(actor, "catalog:read")
  await connectDb()
  if (!mongoose.isValidObjectId(id)) throw new NotFoundError()
  const t = await Taxon.findById(id).lean<TaxonDoc>()
  if (!t) throw new NotFoundError()
  return t
}

/** Adds or renames. A rename reaches every product that uses it, at once, so filters and pages stay in step. */
export async function saveTaxon(
  actor: Actor,
  kind: TaxonKind,
  id: string | null,
  input: { name: string; slug?: string; description?: string; status: "active" | "hidden" }
): Promise<{ id: string; slug: string; productsUpdated: number }> {
  assertPermission(actor, "catalog:write")
  assertKind(kind)
  await connectDb()
  const name = tidyName(input.name)
  if (name.length < 2) throw fieldError("name", "Enter a name.")
  if (name.length > 60) throw fieldError("name", "Use at most 60 characters.")
  const slug = (input.slug?.trim() || slugify(name)).toLowerCase()
  if (!slug) throw fieldError("slug", "Enter a web address.")
  const clash = async (q: Record<string, unknown>) =>
    Taxon.exists({ kind, ...q, ...(id ? { _id: trusted({ $ne: oid(id) }) } : {}) } as never)
  if (
    await Taxon.exists({
      kind,
      name: name,
      ...(id ? { _id: trusted({ $ne: oid(id) }) } : {}),
    } as never).collation({ locale: "en", strength: 2 })
  )
    throw fieldError("name", `There is already a ${KIND_LABEL[kind].one} with that name.`)
  if (await clash({ slug })) throw fieldError("slug", "That web address is already used.")

  let savedId: string
  let productsUpdated = 0
  try {
    if (id) {
      const loaded = await Taxon.findById(oid(id))
      if (!loaded || loaded.kind !== kind) throw new NotFoundError()
      loaded.set({ name, slug, description: input.description || undefined, status: input.status })
      await loaded.save()
      savedId = id
      // Products carry a copy of the name for fast filtering. Keep it in step.
      const { field, attr } = KIND_LABEL[kind]
      const result = await Product.updateMany({ [field]: loaded._id } as never, {
        $set: { [`attributes.${attr}`]: name.toLowerCase() },
      })
      productsUpdated = result.modifiedCount
    } else {
      const last = await Taxon.findOne({ kind })
        .sort({ sortOrder: -1 })
        .select({ sortOrder: 1 })
        .lean<{ sortOrder: number }>()
      savedId = String(
        (
          await Taxon.create({
            kind,
            name,
            slug,
            description: input.description || undefined,
            status: input.status,
            sortOrder: (last?.sortOrder ?? 0) + 1,
          })
        )._id
      )
    }
  } catch (error) {
    if ((error as { code?: number }).code === 11000)
      throw fieldError("name", "That name or web address is already used.")
    throw error
  }
  await recordAudit({
    action: id ? "taxon.updated" : "taxon.created",
    actor,
    entityType: kind,
    entityId: savedId,
    details: { name },
  })
  return { id: savedId, slug, productsUpdated }
}

/** The order the lists appear in, set by dragging. The list must be exactly what exists now. */
export async function reorderTaxa(actor: Actor, kind: TaxonKind, ids: string[]): Promise<void> {
  assertPermission(actor, "catalog:write")
  assertKind(kind)
  await connectDb()
  if (new Set(ids).size !== ids.length || ids.some((i) => !mongoose.isValidObjectId(i)))
    throw new ValidationError("That order is not valid.")
  const existing = await Taxon.find({ kind })
    .select({ _id: 1 })
    .lean<{ _id: mongoose.Types.ObjectId }[]>()
  if (existing.length !== ids.length || existing.some((e) => !ids.includes(String(e._id))))
    throw new ValidationError(
      "The list changed while you were editing. Reload the page and try again."
    )
  await Taxon.bulkWrite(
    ids.map((id, i) => ({
      updateOne: { filter: { _id: oid(id), kind }, update: { $set: { sortOrder: i + 1 } } },
    }))
  )
  await recordAudit({ action: "taxon.reordered", actor, entityType: kind })
}

export async function deleteTaxon(actor: Actor, id: string): Promise<void> {
  assertPermission(actor, "catalog:write")
  await connectDb()
  if (!mongoose.isValidObjectId(id)) throw new NotFoundError()
  const t = await Taxon.findById(oid(id)).lean<TaxonDoc>()
  if (!t) throw new NotFoundError()
  const used = await Product.countDocuments({ [KIND_LABEL[t.kind].field]: t._id } as never)
  if (used > 0)
    throw new ValidationError(
      `${t.name} is used by ${used} ${used === 1 ? "product" : "products"}. Hide it instead, or move those products to another ${KIND_LABEL[t.kind].one} first.`
    )
  await Taxon.deleteOne({ _id: t._id })
  await recordAudit({
    action: "taxon.deleted",
    actor,
    entityType: t.kind,
    entityId: id,
    details: { name: t.name },
  })
}

/** For product saving: the chosen master fabric and print, as the names the shop filters on. */
export async function resolveTaxa(input: {
  fabricId?: string
  printId?: string
}): Promise<{ fabric?: TaxonDoc; print?: TaxonDoc }> {
  await connectDb()
  const find = async (id: string | undefined, kind: TaxonKind, path: string) => {
    if (!id) return undefined
    if (!mongoose.isValidObjectId(id)) throw fieldError(path, "Choose one from the list.")
    const t = await Taxon.findOne({ _id: oid(id), kind }).lean<TaxonDoc>()
    if (!t) throw fieldError(path, `That ${KIND_LABEL[kind].one} no longer exists.`)
    return t
  }
  return {
    fabric: await find(input.fabricId, "fabric", "fabricId"),
    print: await find(input.printId, "print", "printId"),
  }
}

/**
 * Creates master fabrics and prints from what products already say ("cotton", "bandhani") and links the
 * products to them. Safe to run again: it only fills in what is missing.
 */
export async function linkProductsToTaxa(): Promise<{ created: number; linked: number }> {
  await connectDb()
  let created = 0
  let linked = 0
  for (const kind of TAXON_KINDS) {
    const { field, attr } = KIND_LABEL[kind]
    const names: string[] = await Product.distinct(`attributes.${attr}`, {
      [field]: null,
      [`attributes.${attr}`]: trusted({ $exists: true, $ne: null }),
    } as never)
    for (const raw of names.filter(Boolean)) {
      const name = tidyName(raw)
      let taxon = await Taxon.findOne({ kind, name })
        .collation({ locale: "en", strength: 2 })
        .lean<TaxonDoc>()
      if (!taxon) {
        const last = await Taxon.findOne({ kind })
          .sort({ sortOrder: -1 })
          .select({ sortOrder: 1 })
          .lean<{ sortOrder: number }>()
        taxon = (
          await Taxon.create({
            kind,
            name,
            slug: slugify(name) || `${kind}-${created}`,
            sortOrder: (last?.sortOrder ?? 0) + 1,
          })
        ).toObject() as TaxonDoc
        created += 1
      }
      const res = await Product.updateMany(
        { [field]: null, [`attributes.${attr}`]: raw } as never,
        { $set: { [field]: taxon._id } }
      )
      linked += res.modifiedCount
    }
  }
  return { created, linked }
}
