import "server-only"
import mongoose from "mongoose"
import { PAGE_DEFAULTS, PAGE_SLUGS, type PageSlug } from "@/config/pages"
import { connectDb } from "@/lib/db/mongoose"
import { NotFoundError, ValidationError } from "@/lib/errors"
import { assertPermission, type Actor } from "@/lib/security/authorize"
import { ContentPage, type ContentPageDoc } from "@/models/content-page"
import { recordAudit } from "@/services/audit-service"

export type PageContent = {
  slug: PageSlug
  title: string
  description: string
  body: string
  edited: boolean
  updatedAt?: string
}

/** The wording for a page: the owner's version if they have saved one, otherwise the built-in draft. */
export async function getPage(slug: PageSlug): Promise<PageContent> {
  await connectDb()
  const saved = await ContentPage.findOne({ slug }).lean<ContentPageDoc>()
  const base = PAGE_DEFAULTS[slug]
  return saved
    ? {
        slug,
        title: saved.title,
        description: saved.description ?? base.description,
        body: saved.body,
        edited: true,
        updatedAt: saved.updatedAt.toISOString(),
      }
    : { slug, ...base, edited: false }
}

export async function listPagesAdmin(
  actor: Actor
): Promise<{ slug: PageSlug; title: string; edited: boolean; updatedAt?: string }[]> {
  assertPermission(actor, "content:write")
  await connectDb()
  const saved = await ContentPage.find({}).lean<ContentPageDoc[]>()
  const bySlug = new Map(saved.map((s) => [s.slug, s]))
  return PAGE_SLUGS.map((slug) => {
    const s = bySlug.get(slug)
    return {
      slug,
      title: s?.title ?? PAGE_DEFAULTS[slug].title,
      edited: Boolean(s),
      ...(s ? { updatedAt: s.updatedAt.toISOString() } : {}),
    }
  })
}

export async function getPageAdmin(actor: Actor, slug: string): Promise<PageContent> {
  assertPermission(actor, "content:write")
  if (!(PAGE_SLUGS as readonly string[]).includes(slug)) throw new NotFoundError()
  return getPage(slug as PageSlug)
}

export async function savePage(
  actor: Actor,
  slug: string,
  input: { title: string; description?: string; body: string }
): Promise<void> {
  assertPermission(actor, "content:write")
  if (!(PAGE_SLUGS as readonly string[]).includes(slug)) throw new NotFoundError()
  const bad = (path: string, issue: string) =>
    new ValidationError("Please check the highlighted fields.", [{ path, issue }])
  if (input.title.trim().length < 2) throw bad("title", "Enter a title.")
  if (input.body.trim().length < 10) throw bad("body", "Write the page text.")
  if (input.body.length > 20000)
    throw bad("body", "That is too long. Use at most 20,000 characters.")
  if (/<\s*\/?\s*[a-z][^>]*>/i.test(input.body))
    throw bad("body", "HTML is not allowed. Use the simple formatting shown below the box.")
  await connectDb()
  await ContentPage.updateOne(
    { slug: slug as PageSlug },
    {
      $set: {
        title: input.title.trim(),
        description: input.description?.trim() || undefined,
        body: input.body.trim(),
        updatedBy: new mongoose.Types.ObjectId(actor.id),
      },
    },
    { upsert: true }
  )
  await recordAudit({ action: "page.updated", actor, entityType: "page", entityId: slug })
}

/** Back to the built-in draft. */
export async function resetPage(actor: Actor, slug: string): Promise<void> {
  assertPermission(actor, "content:write")
  if (!(PAGE_SLUGS as readonly string[]).includes(slug)) throw new NotFoundError()
  await connectDb()
  await ContentPage.deleteOne({ slug: slug as PageSlug })
  await recordAudit({ action: "page.reset", actor, entityType: "page", entityId: slug })
}
