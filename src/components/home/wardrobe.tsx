"use client"

import Link from "next/link"
import { useRef } from "react"
import { cn } from "cn"
import { gsap, ScrollTrigger } from "@/lib/gsap"
import type { home, Look } from "@/content/home"
import { PhotoOrTint, tintHex, tintVar } from "@/components/home/photo"
import { useScene } from "@/components/home/use-scene"

type Copy = typeof home.wardrobe

/** How dim the outfits that are not showing are. Large text needs 3:1, so not much dimmer than this. */
const DIM = 0.58

/**
 * One model, four outfits. The stage stays in view while the page scrolls; each step wipes the next
 * photograph down over the last, with a saffron line on the moving edge, and the list, the details and
 * the section's tint follow. With reduced motion, the list picks the outfit instead.
 */
export function Wardrobe({ copy }: { copy: Copy }) {
  const ref = useRef<HTMLElement>(null)
  const looks = copy.looks as readonly Look[]
  const n = looks.length
  const api = useRef<{ go: (i: number) => void } | null>(null)

  useScene(ref, ({ reduce }) => {
    const root = ref.current
    if (!root) return
    const stage = root.querySelector<HTMLElement>("[data-ward]")!
    const layers = gsap.utils.toArray<HTMLElement>("[data-look]", root)
    const names = gsap.utils.toArray<HTMLElement>("[data-look-name] [data-title]", root)
    const infos = gsap.utils.toArray<HTMLElement>("[data-look-info]", root)
    const scan = root.querySelector<HTMLElement>("[data-scan]")!
    const art = scan.parentElement!
    const fill = root.querySelector<HTMLElement>("[data-tape-fill]")!

    const show = (i: number) => {
      layers.forEach((l, j) =>
        gsap.set(l, { clipPath: j <= i ? "inset(0% 0% 0% 0%)" : "inset(0% 0% 100% 0%)" })
      )
      names.forEach((el, j) => gsap.set(el, { opacity: j === i ? 1 : DIM }))
      infos.forEach((el, j) => gsap.set(el, { autoAlpha: j === i ? 1 : 0, y: 0 }))
      gsap.set(stage, { backgroundColor: tintHex[looks[i]!.tint].bg })
      gsap.set(fill, { scaleX: n > 1 ? Math.max(0.04, i / (n - 1)) : 1 })
    }

    if (reduce) {
      show(0)
      api.current = { go: show }
      return () => {
        api.current = null
      }
    }

    gsap.set(layers.slice(1), { clipPath: "inset(0% 0% 100% 0%)" })
    gsap.set(infos.slice(1), { autoAlpha: 0 })
    gsap.set(names.slice(1), { opacity: DIM })
    gsap.set(scan, { opacity: 0 })

    const tl = gsap.timeline({
      defaults: { ease: "none" },
      scrollTrigger: {
        trigger: root,
        start: "top top+=64",
        end: "bottom bottom",
        scrub: 0.6,
        invalidateOnRefresh: true,
        snap: { snapTo: 1 / (n - 1), duration: { min: 0.2, max: 0.6 }, ease: "power1.inOut" },
      },
    })
    for (let i = 1; i < n; i++) {
      const at = i - 1
      tl.fromTo(
        layers[i]!,
        { clipPath: "inset(0% 0% 100% 0%)" },
        { clipPath: "inset(0% 0% 0% 0%)", duration: 1, immediateRender: false },
        at
      )
        .fromTo(
          scan,
          { y: 0, opacity: 1 },
          { y: () => art.clientHeight, opacity: 1, duration: 1, immediateRender: false },
          at
        )
        .to(names[i - 1]!, { opacity: DIM, duration: 0.3 }, at + 0.35)
        .to(names[i]!, { opacity: 1, duration: 0.3 }, at + 0.35)
        .to(infos[i - 1]!, { autoAlpha: 0, y: -16, duration: 0.3 }, at + 0.2)
        .fromTo(
          infos[i]!,
          { autoAlpha: 0, y: 16 },
          { autoAlpha: 1, y: 0, duration: 0.3, immediateRender: false },
          at + 0.55
        )
        .to(stage, { backgroundColor: tintHex[looks[i]!.tint].bg, duration: 1 }, at)
    }
    tl.fromTo(fill, { scaleX: 0.04 }, { scaleX: 1, duration: n - 1 }, 0)
    gsap.set(scan, { opacity: 0 }) // the line only shows while a wipe is moving

    api.current = {
      go: (i) => {
        const st = tl.scrollTrigger
        if (!st) return
        st.scroll(st.start + ((st.end - st.start) * i) / (n - 1))
      },
    }
    return () => {
      api.current = null
      ScrollTrigger.getAll()
        .filter((t) => t.trigger === root)
        .forEach((t) => t.kill())
    }
  })

  return (
    <section ref={ref} aria-label="The wardrobe" className="ward-outer relative">
      <div data-ward className="stage flex" style={{ background: tintVar(looks[0]!.tint).bg }}>
        <div className="home-container box-border flex w-full flex-col pt-8 pb-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-4">
            <h2 className="text-[clamp(2.25rem,4.4vw,3.75rem)] leading-none">
              {copy.title} <em>{copy.titleEm}</em>
            </h2>
            <p className="text-sm text-muted-foreground">{copy.hint}</p>
          </div>

          <div className="ward-grid mt-5 grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-14">
            <ol className="ward-list flex flex-col gap-5">
              {looks.map((l, i) => (
                <li key={l.title} data-look-name className="flex items-baseline gap-4">
                  <button
                    type="button"
                    onClick={() => api.current?.go(i)}
                    aria-label={`Show look ${i + 1}: ${l.title}`}
                    className="flex min-h-11 cursor-pointer items-baseline gap-4 text-left"
                  >
                    <span className="text-xs font-bold tracking-[0.06em] text-highlight">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span
                      data-title
                      className="font-display text-[clamp(1.5rem,2.4vw,2.125rem)] leading-tight"
                    >
                      {l.title}
                    </span>
                  </button>
                </li>
              ))}
            </ol>

            <div className="ward-stage-art relative overflow-hidden rounded-t-[999px]">
              {looks.map((l, i) => (
                <div
                  key={l.title}
                  data-look
                  className="absolute inset-0"
                  style={{ clipPath: i === 0 ? undefined : "inset(0% 0% 100% 0%)" }}
                >
                  <PhotoOrTint
                    photo={l.photo}
                    color={tintVar(l.tint).arch}
                    sizes="(min-width: 901px) 342px, 220px"
                  >
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-[16%] bottom-0 h-[82%] rounded-t-[999px] bg-white/35"
                    />
                  </PhotoOrTint>
                </div>
              ))}
              <div
                data-scan
                className="absolute inset-x-0 top-0 h-0.5 bg-saffron opacity-0 shadow-[0_0_14px_rgba(184,118,10,0.7)]"
              />
            </div>

            <div className="ward-info grid">
              {looks.map((l, i) => (
                <div
                  key={l.title}
                  data-look-info
                  className="max-w-[21.25rem]"
                  style={{
                    gridArea: "1 / 1",
                    ...(i === 0 ? {} : { opacity: 0, visibility: "hidden" }),
                  }}
                >
                  <div className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                    {String(i + 1).padStart(2, "0")} · {l.kind}
                  </div>
                  <h3 className="mt-3 text-4xl leading-[1.05]">{l.title}</h3>
                  <p className="mt-3.5 text-[0.9375rem] leading-relaxed text-muted-foreground">
                    {l.desc}
                  </p>
                  <div className="mt-[18px] flex gap-2" aria-hidden="true">
                    {l.colours.map((c) => (
                      <span
                        key={c}
                        className="size-[18px] rounded-full shadow-[inset_0_0_0_1px_rgba(28,43,39,0.15)]"
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                  <div className="mt-5 flex flex-col gap-1 text-sm">
                    {l.from ? <span className="text-base font-semibold">From {l.from}</span> : null}
                    <span className="text-muted-foreground">{l.fabricNote}</span>
                  </div>
                  <Link
                    href={l.href}
                    tabIndex={i === 0 ? undefined : -1}
                    className={cn(
                      "mt-[22px] inline-flex h-12 items-center rounded-full border border-primary px-6 text-sm font-semibold",
                      "hover:bg-primary hover:text-primary-foreground"
                    )}
                  >
                    Shop this look
                  </Link>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <div className="tape relative h-4">
              <div
                data-tape-fill
                className="absolute inset-x-0 -top-0.5 h-[3px] origin-left bg-saffron"
                style={{ transform: "scaleX(0.04)" }}
              />
            </div>
            <div
              className="mt-1.5 flex justify-between text-[0.6875rem] tracking-[0.06em] text-muted-foreground"
              aria-hidden="true"
            >
              <span>LOOK 01</span>
              <span>02</span>
              <span>03</span>
              <span>04</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
