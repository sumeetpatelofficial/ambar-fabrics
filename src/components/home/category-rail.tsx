"use client"

import Image from "next/image"
import Link from "next/link"
import { useRef, type CSSProperties } from "react"
import { ArrowRight } from "lucide-react"
import { gsap, ScrollTrigger } from "@/lib/gsap"
import type { Pattern } from "@/content/home"
import { Eyebrow } from "@/components/home/eyebrow"
import { useScene } from "@/components/home/use-scene"

export type RailCard = {
  title: string
  sub: string
  href: string
  pattern: Pattern
  image?: { url: string; alt: string }
}

/**
 * Shop by category. Scrolling down moves a row of cards sideways while the section stays in view; each
 * card rises as it arrives and its pattern drifts. With reduced motion the row scrolls sideways by hand.
 */
export function CategoryRail({
  eyebrow,
  title,
  titleEm,
  intro,
  allLabel,
  allHref,
  cards,
}: {
  eyebrow: string
  title: string
  titleEm: string
  intro: string
  allLabel: string
  allHref: string
  cards: RailCard[]
}) {
  const ref = useRef<HTMLElement>(null)

  useScene(ref, ({ reduce }) => {
    const root = ref.current
    if (!root || reduce) return
    const stage = root.querySelector<HTMLElement>("[data-stage]")!
    const track = root.querySelector<HTMLElement>("[data-track]")!
    const dist = () => Math.max(0, track.scrollWidth - stage.clientWidth)

    // The section is as tall as the sideways travel needs. The page is given a good estimate when it is
    // drawn (see `estimate` below), and the exact distance once it is measured, so nothing moves.
    const size = () => {
      root.style.setProperty("--rail-travel", `${dist()}px`)
    }
    size()
    const watcher = new ResizeObserver(() => {
      size()
      ScrollTrigger.refresh()
    })
    watcher.observe(track)

    const range = { trigger: root, start: "top top+=64", end: "bottom bottom" }
    const rail = gsap.to(track, {
      x: () => -dist(),
      ease: "none",
      scrollTrigger: { ...range, scrub: 0.5, invalidateOnRefresh: true },
    })
    gsap.fromTo(
      root.querySelector("[data-progress]"),
      { scaleX: 0.02 },
      { scaleX: 1, ease: "none", scrollTrigger: { ...range, scrub: true } }
    )
    root.querySelectorAll<HTMLElement>("[data-pat]").forEach((p) =>
      gsap.fromTo(
        p,
        { backgroundPosition: "0px 0px" },
        {
          backgroundPosition: "-140px 0px",
          ease: "none",
          scrollTrigger: {
            trigger: p,
            containerAnimation: rail,
            start: "left right",
            end: "right left",
            scrub: true,
          },
        }
      )
    )
    root.querySelectorAll<HTMLElement>("[data-card]").forEach((c) =>
      gsap.from(c, {
        y: 70,
        rotation: 2,
        ease: "power2.out",
        scrollTrigger: {
          trigger: c,
          containerAnimation: rail,
          start: "left 98%",
          end: "left 62%",
          scrub: true,
        },
      })
    )
    return () => {
      watcher.disconnect()
      root.style.removeProperty("--rail-travel")
      ScrollTrigger.getAll()
        .filter((t) => t.trigger === root || root.contains(t.trigger as Element))
        .forEach((t) => t.kill())
    }
  })

  /*
   * How far the row has to travel, worked out from the same sizes the CSS uses: the intro, the cards, the
   * "all categories" tile, the gaps and the side padding, less one screen width. Close enough that the page
   * keeps its height when the exact figure is measured.
   */
  const estimate = `max(0px, calc(clamp(260px, 30vw, 400px) + ${cards.length} * clamp(240px, 26vw, 350px) + ${cards.length + 1} * 28px + clamp(220px, 20vw, 280px) + 3 * clamp(16px, 5vw, 80px) - 100vw))`

  return (
    <section
      ref={ref}
      aria-label={eyebrow}
      className="rail-outer relative bg-primary text-primary-foreground"
      style={{ "--rail-travel": estimate } as CSSProperties}
    >
      <div data-stage className="stage rail-stage flex flex-col justify-center">
        <div
          data-track
          className="flex w-max items-start gap-7 pt-10"
          style={{ paddingInline: "clamp(16px, 5vw, 80px)" }}
        >
          <div className="box-border w-[clamp(260px,30vw,400px)] pr-10">
            <Eyebrow tone="gold">{eyebrow}</Eyebrow>
            <h2 className="mt-[18px] text-[clamp(2.5rem,4.6vw,4rem)] leading-none">
              {title} <em>{titleEm}</em>
            </h2>
            <p className="mt-[22px] text-[0.9375rem] leading-relaxed text-primary-foreground/80">
              {intro}
            </p>
            <div className="mt-8 flex items-center gap-3 text-[0.8125rem] font-semibold tracking-[0.06em]">
              Keep scrolling
              <ArrowRight aria-hidden="true" className="h-4 w-7" strokeWidth={1.6} />
            </div>
          </div>

          {cards.map((c, i) => (
            <Link
              key={c.href}
              href={c.href}
              data-card
              className="cat-card flex w-[clamp(240px,26vw,350px)] flex-col text-primary-foreground"
            >
              <div
                data-pat
                className={`relative h-[clamp(280px,50dvh,460px)] overflow-hidden rounded-[2px] ${c.image ? "" : `pat-${c.pattern}`}`}
              >
                {c.image ? (
                  <Image
                    src={c.image.url}
                    alt={c.image.alt}
                    fill
                    sizes="(min-width: 1024px) 350px, 260px"
                    className="object-cover"
                  />
                ) : null}
              </div>
              <div className="mt-[18px] flex items-baseline justify-between gap-3">
                <span className="font-display text-[2rem] leading-tight">{c.title}</span>
                <span className="text-xs font-bold tracking-[0.06em] text-gold-dark">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <span className="mt-1.5 flex justify-between gap-3 text-sm leading-normal text-primary-foreground/80">
                {c.sub}
                <ArrowRight aria-hidden="true" className="cat-arrow size-[18px] shrink-0" />
              </span>
            </Link>
          ))}

          <Link
            href={allHref}
            className="flex h-[clamp(280px,50dvh,460px)] w-[clamp(220px,20vw,280px)] flex-col items-center justify-center gap-4 rounded-[2px] border border-primary-foreground/30 text-primary-foreground"
            style={{ marginRight: "clamp(16px, 5vw, 80px)" }}
          >
            <span className="font-display text-3xl">{allLabel}</span>
            <ArrowRight aria-hidden="true" className="h-4 w-7" strokeWidth={1.6} />
          </Link>
        </div>

        <div className="px-[clamp(16px,5vw,80px)] pt-9" aria-hidden="true">
          <div className="relative h-px bg-primary-foreground/20">
            <div
              data-progress
              className="absolute inset-x-0 -top-px h-[3px] origin-left bg-gold-dark"
              style={{ transform: "scaleX(0.1)" }}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
