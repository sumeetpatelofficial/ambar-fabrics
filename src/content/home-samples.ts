import { dayText, type HomeOffer } from "@/lib/home-offer"
import type { HomeReview } from "@/services/review-service"

/**
 * Stand-in content for the home page's festive offer and reviews, so the design can be seen on a development
 * site that has no coupon or reviews yet. It is shown ONLY when the shop has none of its own AND the site is
 * not running in production (or `HOME_SAMPLE_SECTIONS=1` is set). A real coupon or real reviews always win.
 */
export const showHomeSamples = (): boolean =>
  process.env.NODE_ENV !== "production" || process.env.HOME_SAMPLE_SECTIONS === "1"

export function sampleOffer(now = new Date()): HomeOffer {
  return {
    code: "FESTIVE15",
    kind: "percent",
    figure: 15,
    endsOn: dayText(new Date(now.getTime() + 30 * 86_400_000)),
    minimumRupees: 1500,
  }
}

const review = (name: string, bought: string, rating: number, quote: string): HomeReview => ({
  name,
  bought,
  rating,
  quote,
  href: "/shop",
})

export const sampleReviews: HomeReview[] = [
  review(
    "Meera S.",
    "Gharchola bandhani dupatta",
    5,
    "The bandhani work is fine and the red is exactly as shown. It lifted a plain cotton suit straight away. I would order another colour."
  ),
  review(
    "Anita P.",
    "Block print cotton",
    5,
    "Soft cotton and the block print is crisp. I bought three metres and it was cut cleanly, with no waste. It washed well too."
  ),
  review(
    "Pooja M.",
    "Tissue blouse",
    5,
    "The tissue blouse fits well and the gold catches the light without being loud. Arrived neatly packed."
  ),
  review(
    "Ritu D.",
    "Ajrakh print modal silk",
    4,
    "Beautiful indigo and madder, and the modal silk drapes lightly. A touch longer than I expected, which I liked."
  ),
  review(
    "Nisha T.",
    "Mulmul cotton",
    5,
    "Light, breathable mulmul for summer kurtas. Ordering by the half metre meant I only paid for what I needed."
  ),
  review(
    "Kavita J.",
    "Anarkali kurti",
    4,
    "Lovely chinon and a graceful fall. The size chart was accurate. I wish it came with a matching dupatta."
  ),
  review(
    "Farah S.",
    "Handloom cotton",
    5,
    "Honest handloom cotton with a good weight. The colour matched the photograph and the edges were straight."
  ),
  review(
    "Divya R.",
    "Bandhani dupatta",
    5,
    "Rich colour and a soft fall. It looked far more expensive than it was, and it arrived in two days."
  ),
]
