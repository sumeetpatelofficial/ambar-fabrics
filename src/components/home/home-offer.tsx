import { connection } from "next/server"
import { home } from "@/content/home"
import { FestiveOffer } from "@/components/home/festive-offer"
import { sampleOffer, showHomeSamples } from "@/content/home-samples"
import { getHomeOffer } from "@/services/coupon-service"

/** The coupon the owner has put on the home page, if it can still be used. Nothing is drawn otherwise. */
export async function HomeOffer() {
  await connection() // read per request: a coupon can start, end or be switched off at any time
  // A real coupon always wins; a development site with none shows stand-in values so the design can be seen.
  const offer = (await getHomeOffer()) ?? (showHomeSamples() ? sampleOffer() : null)
  if (!offer) return null
  return <FestiveOffer offer={offer} copy={home.offer} />
}
