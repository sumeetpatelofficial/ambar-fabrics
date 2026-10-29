"use client"

import Link from "next/link"
import { useRef } from "react"
import { gsap } from "@/lib/gsap"
import type { home } from "@/content/home"
import type { HomeReview } from "@/services/review-service"
import { Stars } from "@/components/storefront/stars"
import { Eyebrow } from "@/components/home/eyebrow"
import { Reveal } from "@/components/home/reveal"
import { useScene } from "@/components/home/use-scene"

type Copy = typeof home.reviewsCopy

const BACKGROUNDS = ["#e9ebf1", "#f3e6dc", "#eceee6", "#f3ebd6"]

/**
 * Real customer reviews (see listHomeReviews) in two rows that drift in opposite directions while the page scrolls. With fewer
 * than four reviews there is one row that does not move. Nothing is shown when there are none.
 */
export function Reviews({ copy, reviews }: { copy: Copy; reviews: HomeReview[] }) {
  const ref = useRef<HTMLElement>(null)
  const drifting = reviews.length >= 4
  const rows = drifting
    ? [
        reviews.slice(0, Math.ceil(reviews.length / 2)),
        reviews.slice(Math.ceil(reviews.length / 2)),
      ]
    : [reviews]

  useScene(ref, ({ reduce }) => {
    const root = ref.current
    if (!root || reduce || !drifting) return
    root.querySelectorAll<HTMLElement>("[data-row]").forEach((r, i) =>
      gsap.fromTo(
        r,
        { xPercent: i % 2 ? -22 : 0 },
        {
          xPercent: i % 2 ? 0 : -22,
          ease: "none",
          scrollTrigger: { trigger: root, start: "top bottom", end: "bottom top", scrub: true },
        }
      )
    )
  })

  if (reviews.length === 0) return null

  return (
    <section ref={ref} aria-label="Customer reviews" className="overflow-hidden bg-card py-[120px]">
      <Reveal className="home-container flex flex-wrap items-end justify-between gap-6">
        <div>
          <Eyebrow>{copy.eyebrow}</Eyebrow>
          <h2 className="mt-4 text-[clamp(2.5rem,5vw,4.5rem)] leading-none">
            {copy.title} <em>{copy.titleEm}</em>
          </h2>
        </div>
      </Reveal>
      <div className="mt-14 flex flex-col gap-6">
        {rows.map((row, ri) => (
          <div
            key={ri}
            data-row
            className={`flex gap-6 ${drifting ? "w-max" : "overflow-x-auto"}`}
            style={{ paddingLeft: ri % 2 === 0 ? "clamp(16px, 4vw, 56px)" : 0 }}
          >
            {row.map((t, i) => (
              <figure
                key={`${t.name}-${i}`}
                className="m-0 box-border flex w-[clamp(280px,30vw,400px)] shrink-0 flex-col gap-[22px] rounded-[4px] px-[30px] pt-[30px] pb-[26px]"
                style={{ background: BACKGROUNDS[(i + ri) % BACKGROUNDS.length] }}
              >
                <svg width="34" height="26" viewBox="0 0 34 26" fill="#9a5f05" aria-hidden="true">
                  <path d="M0 26V15C0 6.5 4.5 1.5 13 0l1.5 4C9.6 5.4 7.6 8.2 7.4 12H14v14H0zm19 0V15c0-8.5 4.5-13.5 13-15l1.5 4c-4.9 1.4-6.9 4.2-7.1 8H33v14H19z" />
                </svg>
                <blockquote className="m-0 font-display text-2xl leading-[1.3]">
                  “{t.quote}”
                </blockquote>
                <figcaption className="flex items-end justify-between gap-4 border-t border-foreground/15 pt-4 text-[0.8125rem]">
                  <span>
                    <strong className="block text-sm">{t.name}</strong>
                    <Stars value={t.rating} size="sm" className="mt-1" />
                  </span>
                  <span className="text-right text-muted-foreground">
                    Bought:{" "}
                    <Link
                      href={t.href}
                      className="underline underline-offset-4 hover:text-foreground"
                    >
                      {t.bought}
                    </Link>
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}
