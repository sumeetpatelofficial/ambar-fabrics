"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { ScrollTrigger, gsap } from "@/lib/gsap"
import type { home } from "@/content/home"
import { Eyebrow } from "@/components/home/eyebrow"
import { Reveal } from "@/components/home/reveal"
import { useScene } from "@/components/home/use-scene"

type Copy = typeof home.turnaround

/**
 * "Every angle": while the text on the right scrolls, the model on the left turns through 360 degrees.
 * With turntable photographs it shows the frame that matches the scroll position; until they exist, a
 * fabric swatch turns instead. Photographs load only when the section is close.
 */
export function Turnaround({ copy }: { copy: Copy }) {
  const ref = useRef<HTMLElement>(null)
  const frames = copy.frames
  const [near, setNear] = useState(false)

  // Load the frames once the section is within a few screens.
  useEffect(() => {
    const el = ref.current
    if (!el || frames.length === 0) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true)
          io.disconnect()
        }
      },
      { rootMargin: "1200px 0px" }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [frames.length])

  useScene(ref, ({ reduce }) => {
    const root = ref.current
    if (!root || reduce) return
    const grid = root.querySelector<HTMLElement>("[data-turn-grid]")!
    const deg = root.querySelector<HTMLElement>("[data-deg]")
    const imgs = gsap.utils.toArray<HTMLImageElement>("[data-frame]", root)
    const spin = root.querySelector<HTMLElement>("[data-spin]")
    const range = { trigger: grid, start: "top top+=64", end: "bottom bottom" }

    const label = (progress: number) => {
      if (deg) deg.textContent = `${Math.round(progress * 360)}°`
    }

    if (imgs.length > 0) {
      let shown = 0
      ScrollTrigger.create({
        ...range,
        scrub: 0.5,
        onUpdate: (self) => {
          const i = Math.min(imgs.length - 1, Math.floor(self.progress * imgs.length))
          if (i !== shown) {
            imgs[shown]!.style.opacity = "0"
            imgs[i]!.style.opacity = "1"
            shown = i
          }
          label(self.progress)
        },
      })
    } else if (spin) {
      gsap.fromTo(
        spin,
        { rotationY: 0 },
        {
          rotationY: 360,
          ease: "none",
          scrollTrigger: { ...range, scrub: 0.5, onUpdate: (self) => label(self.progress) },
        }
      )
    }
    gsap.to(root.querySelector("[data-dial]"), {
      rotation: 360,
      ease: "none",
      scrollTrigger: { ...range, scrub: 0.5 },
    })
    root.querySelectorAll<HTMLElement>("[data-turn-block]").forEach((b) =>
      gsap.from(b, {
        y: 60,
        opacity: 0,
        duration: 1,
        ease: "power3.out",
        scrollTrigger: { trigger: b, start: "top 78%", once: true },
      })
    )
    return () => {
      ScrollTrigger.getAll()
        .filter((t) => t.trigger && root.contains(t.trigger as Element))
        .forEach((t) => t.kill())
    }
  })

  return (
    <section ref={ref} aria-label={copy.eyebrow}>
      <Reveal className="home-container pt-[120px]">
        <Eyebrow>{copy.eyebrow}</Eyebrow>
        <h2 className="mt-4 max-w-[47.5rem] text-[clamp(2.5rem,5vw,4.5rem)] leading-none">
          {copy.title} <em>{copy.titleEm}</em>
        </h2>
      </Reveal>

      <div
        data-turn-grid
        className="turn-grid home-container grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-12"
      >
        <div className="relative">
          <div
            className="turn-sticky sticky top-[var(--hdr)] flex items-center justify-center"
            style={{ height: "clamp(560px, calc(100dvh - var(--hdr)), 820px)" }}
          >
            <div className="relative flex h-[84%] w-[min(420px,100%)] items-end justify-center">
              <div
                aria-hidden="true"
                className="absolute inset-0 rounded-t-[999px] border border-b-0 border-foreground/15"
              />
              <div
                aria-hidden="true"
                className="absolute bottom-[-150px] left-1/2 -ml-[170px] size-[340px]"
                style={{ transform: "rotateX(78deg)" }}
              >
                <div
                  data-dial
                  className="absolute inset-0 rounded-full border-[1.5px] border-dashed border-foreground/35"
                >
                  <span className="absolute -top-1.5 left-1/2 -ml-1.5 size-3 rounded-full bg-saffron" />
                </div>
              </div>
              <div aria-hidden="true" className="absolute top-[28%] -left-2 flex flex-col gap-0.5">
                <span className="text-[0.6875rem] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                  Rotation
                </span>
                <span data-deg className="font-display text-[3.25rem] leading-none">
                  0°
                </span>
              </div>

              {frames.length > 0 ? (
                <div className="relative h-[96%] w-[78%]">
                  {frames.map((f, i) => (
                    // Plain images swapped by opacity: a re-render of an optimised image per frame would be heavy.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={f.src}
                      data-frame
                      src={near || i === 0 ? f.src : undefined}
                      alt={i === 0 ? copy.fallbackAlt : ""}
                      decoding="async"
                      className="absolute inset-0 size-full object-contain object-[50%_100%]"
                      style={{ opacity: i === 0 ? 1 : 0 }}
                    />
                  ))}
                </div>
              ) : (
                <div
                  role="img"
                  aria-label={copy.fallbackAlt}
                  className="relative h-[92%] w-[60%]"
                  style={{ perspective: "1400px" }}
                >
                  <div
                    data-spin
                    className="absolute inset-0"
                    style={{ transformStyle: "preserve-3d" }}
                  >
                    <div
                      className="pat-indigo-l absolute inset-0 rounded-t-[999px]"
                      style={{ backfaceVisibility: "hidden" }}
                    />
                    <div
                      className="pat-indigo absolute inset-0 rounded-t-[999px]"
                      style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div>
          {copy.blocks.map((b) => (
            <article
              key={b.view}
              data-turn-block
              className="turn-block flex max-w-[28.75rem] flex-col justify-center"
              style={{ minHeight: "clamp(480px, 78dvh, 680px)" }}
            >
              <div className="flex items-center gap-3 text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                <span className="text-highlight">{b.degrees}</span>
                <span className="h-px w-7 bg-foreground/40" />
                {b.view}
              </div>
              <h3 className="mt-4 text-[clamp(2rem,3.4vw,2.875rem)] leading-[1.05]">{b.title}</h3>
              <p className="mt-4 text-base leading-[1.65] text-muted-foreground">{b.body}</p>
              {b.details && b.details.length > 0 ? (
                <dl className="mt-[26px] grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 border-t border-foreground/15 pt-[18px] text-sm">
                  {b.details.map((d) => (
                    <div key={d.label} className="contents">
                      <dt className="text-muted-foreground">{d.label}</dt>
                      <dd className="font-semibold">{d.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </article>
          ))}
          <article
            data-turn-block
            className="turn-block flex max-w-[28.75rem] flex-col justify-center"
            style={{ minHeight: "clamp(480px, 78dvh, 680px)" }}
          >
            <div className="flex items-center gap-3 text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
              <span className="text-highlight">{copy.final.degrees}</span>
              <span className="h-px w-7 bg-foreground/40" />
              {copy.final.view}
            </div>
            <h3 className="mt-4 text-[clamp(2rem,3.4vw,2.875rem)] leading-[1.05]">
              {copy.final.title}
            </h3>
            <p className="mt-4 text-base leading-[1.65] text-muted-foreground">{copy.final.body}</p>
            <div className="mt-7 flex flex-wrap gap-3.5">
              <Link
                href={copy.final.primary.href}
                className="inline-flex h-[3.125rem] items-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                {copy.final.primary.label}
              </Link>
              <Link
                href={copy.final.secondary.href}
                className="inline-flex h-[3.125rem] items-center rounded-full border border-primary px-6 text-sm font-semibold hover:bg-primary hover:text-primary-foreground"
              >
                {copy.final.secondary.label}
              </Link>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}
