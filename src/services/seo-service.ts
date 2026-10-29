import "server-only"
import mongoose from "mongoose"
import { PAGE_SLUGS } from "@/config/pages"
import { categoryHref } from "@/lib/category-url"
import { connectDb } from "@/lib/db/mongoose"
import { NotFoundError, ValidationError } from "@/lib/errors"
import { assertPermission, type Actor } from "@/lib/security/authorize"
import { Category } from "@/models/category"
import { Collection } from "@/models/collection"
import { Product } from "@/models/product"
import { Taxon } from "@/models/taxon"
import { Redirect, type RedirectDoc } from "@/models/redirect"
import { recordAudit } from "@/services/audit-service"

const trusted = mongoose.trusted

export type SitemapEntry = { path: string; lastModified?: Date; priority?: number }

/** Every public page worth indexing. Hidden, draft and empty things are left out, as in the shop itself. */
export async function getSitemapEntries(now = new Date()): Promise<SitemapEntry[]> {
  await connectDb()
  const [products, categories, collections, taxa] = await Promise.all([
    Product.find({ status: "active", variantCount: trusted({ $gte: 1 }) } as never)
      .select({ slug: 1, updatedAt: 1 })
      .lean<{ slug: string; updatedAt: Date }[]>(),
    Category.find({ status: "active" }).select({ slug: 1, updatedAt: 1, parentId: 1 }).lean<
      {
        _id: mongoose.Types.ObjectId
        slug: string
        updatedAt: Date
        parentId?: mongoose.Types.ObjectId | null
      }[]
    >(),
    Collection.find({ status: "active" })
      .select({ slug: 1, updatedAt: 1, startsAt: 1, endsAt: 1 })
      .lean<{ slug: string; updatedAt: Date; startsAt?: Date; endsAt?: Date }[]>(),
    Taxon.find({ status: "active" })
      .select({ kind: 1, slug: 1, updatedAt: 1 })
      .lean<{ kind: string; slug: string; updatedAt: Date }[]>(),
  ])
  const live = collections.filter(
    (c) => !(c.startsAt && c.startsAt > now) && !(c.endsAt && c.endsAt < now)
  )
  return [
    { path: "/", priority: 1 },
    { path: "/shop", priority: 0.9 },
    { path: "/categories", priority: 0.8 },
    { path: "/new-arrivals", priority: 0.7 },
    { path: "/bestsellers", priority: 0.7 },
    { path: "/fabrics", priority: 0.7 },
    { path: "/prints", priority: 0.6 },
    { path: "/sale", priority: 0.6 },
    ...categories.map((c) => ({
      path: categoryHref(
        c.slug,
        c.parentId ? categories.find((p) => String(p._id) === String(c.parentId))?.slug : undefined
      ),
      lastModified: c.updatedAt,
      priority: 0.8,
    })),
    ...(collections.length
      ? live.map((c) => ({
          path: `/collections/${c.slug}`,
          lastModified: c.updatedAt,
          priority: 0.6,
        }))
      : []),
    ...taxa.map((t) => ({
      path: `/${t.kind}s/${t.slug}`,
      lastModified: t.updatedAt,
      priority: 0.7,
    })),
    ...products.map((p) => ({
      path: `/products/${p.slug}`,
      lastModified: p.updatedAt,
      priority: 0.7,
    })),
    ...PAGE_SLUGS.map((slug) => ({ path: `/${slug}`, priority: 0.3 })),
  ]
}

// ------------------------------------------------------------------ redirects

const CATALOG_PATH = /^\/(products|categories|collections)\/[a-z0-9]+(?:-[a-z0-9]+)*$/

export async function listRedirects(actor: Actor): Promise<RedirectDoc[]> {
  assertPermission(actor, "content:write")
  await connectDb()
  return Redirect.find({}).sort({ createdAt: -1 }).limit(300).lean<RedirectDoc[]>()
}

/** A moved page: where it was and where it is now. Only shop addresses can be redirected (products, categories, collections). */
export async function saveRedirect(
  actor: Actor,
  input: { fromPath: string; toPath: string; permanent: boolean }
): Promise<void> {
  assertPermission(actor, "content:write")
  const bad = (path: string, issue: string) =>
    new ValidationError("Please check the highlighted fields.", [{ path, issue }])
  const from = input.fromPath.trim()
  const to = input.toPath.trim()
  if (!CATALOG_PATH.test(from)) throw bad("fromPath", "Use a shop address like /products/old-name.")
  if (!/^\/(?!\/)[^\s?#]*(\?[^\s#]*)?$/.test(to))
    throw bad("toPath", "Use an address on this site, starting with /.")
  if (from === to) throw bad("toPath", "That points to itself.")
  await connectDb()
  // A redirect that points at another redirect would chain; point straight at the final page instead.
  if (await Redirect.exists({ fromPath: to }))
    throw bad("toPath", "That address is itself redirected. Point to the final page.")
  try {
    await Redirect.updateOne(
      { fromPath: from },
      { $set: { toPath: to, statusCode: input.permanent ? 301 : 302 } },
      { upsert: true }
    )
  } catch (error) {
    if ((error as { name?: string }).name === "ValidationError")
      throw bad("toPath", "That address is not valid.")
    throw error
  }
  await recordAudit({
    action: "redirect.saved",
    actor,
    entityType: "redirect",
    entityId: from,
    details: { to },
  })
}

export async function deleteRedirect(actor: Actor, id: string): Promise<void> {
  assertPermission(actor, "content:write")
  await connectDb()
  if (!mongoose.isValidObjectId(id)) throw new NotFoundError()
  const removed = await Redirect.findByIdAndDelete(id).lean()
  if (!removed) throw new NotFoundError()
  await recordAudit({ action: "redirect.deleted", actor, entityType: "redirect", entityId: id })
}
