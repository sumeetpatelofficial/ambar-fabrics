import Link from "next/link"
import { Suspense } from "react"
import { Stars } from "@/components/storefront/stars"
import { ReviewForm } from "@/components/storefront/reviews/review-form"
import { getSessionUser } from "@/lib/auth/session"
import { cachedReviews } from "@/services/catalog-cache"
import { getEligibility } from "@/services/review-service"

const date = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(
    new Date(iso)
  )

/** Approved reviews from buyers, and a way to add one for people who bought it. */
export async function ReviewsSection({ slug }: { slug: string }) {
  const data = await cachedReviews(slug, 1)
  if (!data) return null
  const { summary, reviews } = data
  return (
    <section aria-labelledby="reviews" className="flex flex-col gap-6 border-t pt-10">
      <h2 id="reviews" className="text-3xl">
        Reviews
      </h2>
      {summary.count === 0 ? (
        <p className="text-muted-foreground">
          No reviews yet. Reviews come from people who bought this and received it.
        </p>
      ) : (
        <div className="grid gap-8 md:grid-cols-[14rem_1fr]">
          <div className="flex flex-col gap-2">
            <p className="tabular text-5xl">{summary.avg.toFixed(1)}</p>
            <Stars value={summary.avg} size="lg" />
            <p className="text-sm text-muted-foreground">
              Based on {summary.count} {summary.count === 1 ? "review" : "reviews"}
            </p>
            <ul className="mt-2 flex flex-col gap-1 text-sm" aria-label="Ratings breakdown">
              {[5, 4, 3, 2, 1].map((n) => (
                <li key={n} className="flex items-center gap-2">
                  <span className="w-12">{n} stars</span>
                  <span className="h-2 flex-1 bg-muted" aria-hidden="true">
                    <span
                      className="block h-2 bg-brass"
                      style={{ width: `${(summary.counts[n - 1]! / summary.count) * 100}%` }}
                    />
                  </span>
                  <span className="tabular w-6 text-right text-muted-foreground">
                    {summary.counts[n - 1]}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <ul className="flex flex-col divide-y">
            {reviews.map((r) => (
              <li key={r.id} className="flex flex-col gap-1.5 py-5 first:pt-0">
                <Stars value={r.rating} />
                {r.title ? <h3 className="font-sans text-base font-medium">{r.title}</h3> : null}
                <p className="max-w-prose whitespace-pre-line">{r.body}</p>
                <p className="text-sm text-muted-foreground">
                  {r.author}, {date(r.date)}. Bought this.
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Suspense fallback={null}>
        <Composer slug={slug} />
      </Suspense>
    </section>
  )
}

/** Depends on who is signed in, so it renders per visitor, after the shared content above. */
async function Composer({ slug }: { slug: string }) {
  const user = await getSessionUser()
  const eligibility = await getEligibility(user?.id ?? null, slug)
  if (eligibility.canReview) return <ReviewForm slug={slug} existing={eligibility.existing} />
  if (eligibility.reason === "signed_out")
    return (
      <p className="text-sm">
        <Link
          href={`/login?next=${encodeURIComponent(`/products/${slug}`)}`}
          className="underline underline-offset-4"
        >
          Sign in
        </Link>{" "}
        if you have bought this and want to review it.
      </p>
    )
  if (eligibility.reason === "not_delivered")
    return (
      <p className="text-sm text-muted-foreground">
        You can review this once your order has been delivered.
      </p>
    )
  return null
}
