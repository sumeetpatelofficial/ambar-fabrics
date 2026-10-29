"use client"

import Link from "next/link"
import { useRef, useState, type ReactNode } from "react"
import { ArrowRight, Pause, Play } from "lucide-react"
import { cn } from "cn"
import { gsap, ScrollTrigger } from "@/lib/gsap"
import type { HeroSlide } from "@/content/home"
import { Eyebrow } from "@/components/home/eyebrow"
import { PhotoOrTint, tintVar } from "@/components/home/photo"
import { useScene } from "@/components/home/use-scene"

const SECONDS = 6

/** Where the three floating swatches sit around the arch, how big and tilted they are, and how far the pointer moves them. */
const SWATCHES = [
  { size: 86, rotate: "-8deg", depth: 2.4, delay: "0s", place: { left: -52, top: "14%" } },
  { size: 66, rotate: "9deg", depth: 1.1, delay: "-1.8s", place: { right: -40, top: "46%" } },
  { size: 56, rotate: "6deg", depth: 1.8, delay: "-3.4s", place: { left: -30, bottom: "16%" } },
] as const

/** The first slide's title is the page's h1; the others are h2, so there is always one h1 on the page. */
function Title({
  as: Tag,
  className,
  children,
}: {
  as: "h1" | "h2"
  className: string
  children: ReactNode
}) {
  return <Tag className={className}>{children}</Tag>
}

/**
 * Three slides that change every six seconds. Each change reveals the photograph from the bottom up,
 * grows the arch and lifts the text in. With reduced motion nothing moves by itself; the three bars
 * below still switch slides. A pause button stops the timer for everyone.
 */
export function HeroCarousel({
  slides,
  secondary,
}: {
  slides: HeroSlide[]
  secondary: { label: string; href: string }
}) {
  const ref = useRef<HTMLElement>(null)
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const controls = useRef<{ go: (i: number) => void; setPaused: (p: boolean) => void } | null>(null)

  useScene(ref, ({ reduce }) => {
    const root = ref.current
    if (!root) return
    const els = {
      slides: gsap.utils.toArray<HTMLElement>("[data-slide]", root),
      bars: gsap.utils.toArray<HTMLElement>("[data-bar]", root),
      tints: gsap.utils.toArray<HTMLElement>("[data-tint]", root),
    }
    const n = els.slides.length
    let current = 0
    let userPaused = false
    let tween: gsap.core.Tween | null = null

    gsap.set(els.slides, { autoAlpha: 0 })
    gsap.set(els.slides[0]!, { autoAlpha: 1 })
    gsap.set(els.bars, { scaleX: 0, transformOrigin: "0% 50%" })

    const fillBars = (upTo: number) =>
      els.bars.forEach((b, j) => gsap.set(b, { scaleX: j < upTo ? 1 : 0 }))

    const run = (i: number) => {
      tween?.kill()
      fillBars(i)
      tween = gsap.fromTo(
        els.bars[i]!,
        { scaleX: 0 },
        { scaleX: 1, duration: SECONDS, ease: "none", onComplete: () => show((i + 1) % n, true) }
      )
      if (userPaused || document.hidden) tween.pause()
    }

    const show = (i: number, animate: boolean) => {
      if (i === current) return
      const from = els.slides[current]!
      const to = els.slides[i]!
      current = i
      setActive(i)
      if (!animate || reduce) {
        gsap.set(from, { autoAlpha: 0 })
        gsap.set(to, { autoAlpha: 1 })
        gsap.set(els.tints, { opacity: 0 })
        gsap.set(els.tints[i]!, { opacity: 1 })
        gsap.set(els.bars, { scaleX: 0 })
        gsap.set(els.bars[i]!, { scaleX: 1 })
        return
      }
      gsap.to(from, { autoAlpha: 0, duration: 0.7, ease: "power2.out" })
      gsap.set(to, { autoAlpha: 1 })
      // The whole backdrop changes colour with the slide.
      gsap.to(els.tints[els.slides.indexOf(from)]!, {
        opacity: 0,
        duration: 0.7,
        ease: "power2.out",
      })
      gsap.to(els.tints[i]!, { opacity: 1, duration: 0.7, ease: "power2.out" })
      // The big word slides in from the right, and the swatches pop up one after another.
      gsap.fromTo(
        to.querySelectorAll("[data-ghost]"),
        { xPercent: 12, autoAlpha: 0 },
        { xPercent: 0, autoAlpha: 1, duration: 1.1, ease: "power3.out" }
      )
      gsap.fromTo(
        to.querySelectorAll("[data-swatch]"),
        { scale: 0, autoAlpha: 0 },
        {
          scale: 1,
          autoAlpha: 1,
          duration: 0.9,
          stagger: 0.1,
          ease: "back.out(1.8)",
          delay: 0.3,
        }
      )
      gsap.fromTo(
        to.querySelectorAll("[data-rise]"),
        { y: 40, autoAlpha: 0 },
        { y: 0, autoAlpha: 1, duration: 0.9, stagger: 0.08, ease: "power3.out", delay: 0.15 }
      )
      gsap.fromTo(
        to.querySelectorAll("[data-model]"),
        { clipPath: "inset(100% 0% 0% 0%)" },
        { clipPath: "inset(0% 0% 0% 0%)", duration: 1.2, ease: "power3.inOut" }
      )
      gsap.fromTo(
        to.querySelectorAll("[data-arch]"),
        { scale: 0.92 },
        { scale: 1, duration: 1.2, ease: "power3.out" }
      )
      run(i)
    }

    controls.current = {
      go: (i) => {
        show(i, true)
        if (reduce) return
        userPaused = false
        setPaused(false)
      },
      setPaused: (p) => {
        userPaused = p
        if (!tween) return
        if (p) tween.pause()
        else if (!document.hidden) tween.resume()
      },
    }

    if (reduce) {
      // One slide at a time, only when asked: the first bar shows which slide this is.
      gsap.set(els.bars[0]!, { scaleX: 1 })
      return () => {
        controls.current = null
      }
    }

    run(0)

    // Stop the timer while the tab is hidden.
    const onVisibility = () => {
      if (!tween) return
      if (document.hidden) tween.pause()
      else if (!userPaused) tween.resume()
    }
    document.addEventListener("visibilitychange", onVisibility)

    // Cursor parallax: the swatches, the mandala and the big word follow the pointer by different amounts
    // (the word the opposite way). Only for a real mouse; touch and reduced motion skip it entirely.
    let stopParallax = () => {}
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      const movers = gsap.utils.toArray<HTMLElement>("[data-depth]", root).map((el) => ({
        x: gsap.quickTo(el, "x", { duration: 0.8, ease: "power3.out" }),
        y: gsap.quickTo(el, "y", { duration: 0.8, ease: "power3.out" }),
        depth: Number(el.dataset.depth),
      }))
      const move = (e: PointerEvent) => {
        if (e.pointerType !== "mouse") return
        const box = root.getBoundingClientRect()
        const nx = (e.clientX - box.left) / box.width - 0.5
        const ny = (e.clientY - box.top) / box.height - 0.5
        for (const m of movers) {
          m.x(nx * 24 * m.depth)
          m.y(ny * 24 * m.depth)
        }
      }
      const rest = () => {
        for (const m of movers) {
          m.x(0)
          m.y(0)
        }
      }
      root.addEventListener("pointermove", move)
      root.addEventListener("pointerleave", rest)
      stopParallax = () => {
        root.removeEventListener("pointermove", move)
        root.removeEventListener("pointerleave", rest)
      }
    }

    // Scrolling away: the hero drifts up and fades.
    const inner = root.querySelector("[data-hero-inner]")
    if (inner) {
      gsap.to(inner, {
        yPercent: -10,
        autoAlpha: 0.3,
        ease: "none",
        scrollTrigger: { trigger: root, start: "top top+=64", end: "bottom top+=64", scrub: true },
      })
    }

    return () => {
      tween?.kill()
      stopParallax()
      document.removeEventListener("visibilitychange", onVisibility)
      controls.current = null
      ScrollTrigger.getAll()
        .filter((t) => t.trigger === root)
        .forEach((t) => t.kill())
    }
  })

  return (
    <section
      ref={ref}
      aria-roledescription="carousel"
      aria-label="Featured collections"
      className="relative h-[clamp(600px,calc(92dvh-4rem),820px)] overflow-hidden"
    >
      <div aria-hidden="true" className="absolute inset-0">
        {slides.map((s, i) => (
          <div
            key={s.label}
            data-tint
            className="absolute inset-0"
            style={{ background: s.tintBg, opacity: i === 0 ? 1 : 0 }}
          />
        ))}
      </div>
      <div data-hero-inner className="absolute inset-0">
        {slides.map((s, i) => (
          <div
            key={s.label}
            data-slide
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${slides.length}: ${s.label}`}
            aria-hidden={i !== active}
            className="absolute inset-0"
            style={i === 0 ? undefined : { opacity: 0, visibility: "hidden" }}
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-[3%] max-[900px]:top-[52%]"
            >
              <div className="home-container flex justify-end">
                <div data-depth="-0.7">
                  <span
                    data-ghost
                    className="ghost"
                    data-text={s.ghost.word}
                    style={{ color: s.ghost.colour }}
                  />
                </div>
              </div>
            </div>
            <div className="home-container relative box-border h-full pt-12 pb-24">
              <div className="grid h-full grid-cols-1 gap-4 max-[900px]:grid-rows-[auto_minmax(0,1fr)] min-[901px]:grid-cols-[1.05fr_1fr] min-[901px]:gap-10">
                <div className="self-center">
                  <div data-rise className="flex items-center gap-3">
                    <Eyebrow tone="muted" className="flex items-center gap-3">
                      <span className="text-highlight">{String(i + 1).padStart(2, "0")}</span>
                      <span className="h-px w-8 bg-foreground/40" />
                      <span>{s.eyebrow}</span>
                    </Eyebrow>
                  </div>
                  <Title
                    as={i === 0 ? "h1" : "h2"}
                    className="mt-5 text-[clamp(3.25rem,8.4vw,8.25rem)] leading-[0.9] tracking-[-0.02em]"
                  >
                    <span data-rise className="block">
                      {s.line1}
                    </span>
                    <span data-rise className="block italic" style={{ color: s.ink }}>
                      {s.line2}
                    </span>
                  </Title>
                  <p
                    data-rise
                    className="mt-6 max-w-[26rem] text-base leading-relaxed text-muted-foreground"
                  >
                    {s.text}
                  </p>
                  <div data-rise className="mt-8 flex flex-wrap items-center gap-6">
                    <Link
                      href={s.cta.href}
                      className="inline-flex h-[3.125rem] items-center gap-2.5 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                    >
                      {s.cta.label}
                      <ArrowRight aria-hidden="true" className="size-4" />
                    </Link>
                    <Link
                      href={secondary.href}
                      className="text-sm font-semibold underline underline-offset-[6px]"
                    >
                      {secondary.label}
                    </Link>
                  </div>
                </div>
                <div className="relative flex min-h-0 items-end justify-center">
                  <div className="relative h-full w-[min(360px,100%)]">
                    <div aria-hidden="true" className="pointer-events-none">
                      <div
                        data-depth="0.5"
                        className="absolute top-[-11%] left-1/2 -ml-[350px] size-[700px] max-[900px]:-ml-[240px] max-[900px]:size-[480px]"
                      >
                        <div
                          className="mandala size-full"
                          style={{ ["--mandala-ink" as string]: s.ink }}
                        />
                      </div>
                      <div
                        className="absolute -inset-x-[22px] -top-[22px] bottom-0 rounded-t-[999px] border border-b-0"
                        style={{ borderColor: s.ink, opacity: 0.22 }}
                      />
                      <div
                        className="absolute -inset-x-[50px] -top-[50px] bottom-0 rounded-t-[999px] border border-b-0 border-dashed"
                        style={{ borderColor: s.ink, opacity: 0.16 }}
                      />
                    </div>
                    <div
                      data-arch
                      className="relative h-full w-full overflow-hidden rounded-t-[999px]"
                      style={{ background: tintVar(s.tint).arch }}
                    >
                      <div data-model className="absolute inset-0">
                        <PhotoOrTint
                          photo={s.photo}
                          color={tintVar(s.tint).arch}
                          sizes="(min-width: 901px) 360px, 90vw"
                          priority={i === 0}
                        />
                      </div>
                    </div>
                    <div aria-hidden="true" className="pointer-events-none max-[900px]:hidden">
                      {SWATCHES.map((w, k) => (
                        <div
                          key={k}
                          data-swatch
                          data-depth={w.depth}
                          className="absolute"
                          style={{ ...w.place, width: w.size, height: w.size }}
                        >
                          <div
                            className={`swatch-bob pat-${s.swatches[k]} size-full rounded-[3px] shadow-[0_14px_28px_-10px_rgba(28,43,39,0.45)]`}
                            style={{ ["--r" as string]: w.rotate, animationDelay: w.delay }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="hero-cap absolute right-0 bottom-8 max-w-[13.75rem] rounded-[4px] bg-card px-[18px] py-3.5 text-[0.8125rem] shadow-[0_12px_32px_rgba(28,43,39,0.12)]">
                    <div className="font-semibold">{s.caption}</div>
                    {s.from ? (
                      <div className="mt-1 text-muted-foreground">From {s.from}</div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="absolute inset-x-0 bottom-3 z-[3]">
        <div className="home-container flex items-center gap-5">
          {slides.map((s, i) => (
            <button
              key={s.label}
              type="button"
              aria-label={`Show ${s.label}`}
              aria-current={i === active ? "true" : undefined}
              onClick={() => controls.current?.go(i)}
              className="min-h-11 flex-[0_1_11.25rem] cursor-pointer py-3 text-left text-foreground"
            >
              <span className="text-xs font-semibold tracking-[0.04em]">
                {String(i + 1).padStart(2, "0")} · {s.label}
              </span>
              <span className="relative mt-2.5 block h-0.5 overflow-hidden bg-foreground/15">
                <span data-bar className="absolute inset-0 origin-left bg-primary" />
              </span>
            </button>
          ))}
          <button
            type="button"
            aria-label={paused ? "Play slides" : "Pause slides"}
            aria-pressed={paused}
            onClick={() => {
              const next = !paused
              setPaused(next)
              controls.current?.setPaused(next)
            }}
            className={cn(
              "grid size-11 cursor-pointer place-items-center rounded-full text-foreground hover:bg-foreground/5",
              "motion-reduce:hidden"
            )}
          >
            {paused ? (
              <Play aria-hidden="true" className="size-4" />
            ) : (
              <Pause aria-hidden="true" className="size-4" />
            )}
          </button>
          <div className="ml-auto flex items-center gap-3 text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase max-[900px]:hidden">
            Scroll
            <span className="relative block h-9 w-px overflow-hidden bg-foreground/15">
              <span className="cue absolute inset-0 bg-primary" />
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
