import { connection } from "next/server"
import { home } from "@/content/home"
import { Reviews } from "@/components/home/reviews"
import { sampleReviews, showHomeSamples } from "@/content/home-samples"
import { listHomeReviews } from "@/services/review-service"

/** The shop's best real reviews. Nothing is drawn until there are some. */
export async function HomeReviews() {
  await connection() // read per request
  const real = await listHomeReviews()
  const reviews = real.length > 0 ? real : showHomeSamples() ? sampleReviews : []
  if (reviews.length === 0) return null
  return <Reviews copy={home.reviewsCopy} reviews={reviews} />
}
