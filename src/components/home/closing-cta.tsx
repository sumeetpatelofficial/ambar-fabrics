"use client"

import Link from "next/link"
import { useActionState, useRef } from "react"
import { ArrowRight, MessageCircle } from "lucide-react"
import { gsap } from "@/lib/gsap"
import type { home } from "@/content/home"
import { subscribeAction } from "@/features/home/actions"
import { initialFormState } from "@/features/form-state"
import { useScene } from "@/components/home/use-scene"

type Copy = typeof home.closing

/**
 * The closing call to action: a very large headline whose lines rise out of a mask, a round badge that
 * turns with the page, links to the shop and WhatsApp, and the sign-up form.
 */
export function ClosingCta({ copy }: { copy: Copy }) {
  const ref = useRef<HTMLElement>(null)
  const [state, action, pending] = useActionState(subscribeAction, initialFormState)

  useScene(ref, ({ reduce }) => {
    const root = ref.current
    if (!root || reduce) return
    gsap.from(root.querySelectorAll("[data-word]"), {
      yPercent: 110,
      duration: 1.1,
      stagger: 0.14,
      ease: "power3.out",
      scrollTrigger: { trigger: root, start: "top 70%", once: true },
    })
    gsap.fromTo(
      root.querySelector("[data-badge]"),
      { rotation: 0 },
      {
        rotation: 220,
        ease: "none",
        transformOrigin: "50% 50%",
        scrollTrigger: { trigger: root, start: "top bottom", end: "bottom top", scrub: true },
      }
    )
  })

  const ring = `CUT TO ORDER · BY THE METRE${copy.sinceYear ? ` · SINCE ${copy.sinceYear}` : ""} · `
  const error = state.fieldErrors?.email

  return (
    <section
      ref={ref}
      aria-label="Get in touch"
      className="relative overflow-hidden bg-secondary pt-[130px] pb-[120px]"
    >
      <div className="home-container relative">
        <svg
          data-badge
          viewBox="0 0 200 200"
          aria-hidden="true"
          className="absolute -top-10 right-[clamp(16px,4vw,56px)] h-auto w-[clamp(120px,14vw,190px)]"
        >
          <defs>
            <path id="badge-ring" d="M100 100 m-78 0 a78 78 0 1 1 156 0 a78 78 0 1 1 -156 0" />
          </defs>
          <circle cx="100" cy="100" r="99" fill="#1c2b27" />
          <text fill="#f5efe4" style={{ fontSize: 15, fontWeight: 700, letterSpacing: 4.4 }}>
            <textPath href="#badge-ring">{ring}</textPath>
          </text>
          <circle cx="100" cy="100" r="30" fill="#b8760a" />
        </svg>

        <h2 className="text-[clamp(4rem,11vw,10.5rem)] leading-[0.92] tracking-[-0.025em]">
          <span className="block overflow-hidden">
            <span data-word className="inline-block">
              {copy.title1}
            </span>
          </span>
          <span className="block overflow-hidden">
            <span data-word className="inline-block text-offer italic">
              {copy.title2}
            </span>
          </span>
        </h2>

        <div className="mt-[52px] flex flex-wrap items-end justify-between gap-x-[72px] gap-y-10">
          <div className="max-w-[28.75rem]">
            <p className="text-[1.0625rem] leading-relaxed text-muted-foreground">{copy.text}</p>
            <div className="mt-7 flex flex-wrap gap-3.5">
              <Link
                href={copy.shop.href}
                className="inline-flex h-[3.375rem] items-center gap-2.5 rounded-full bg-primary px-[30px] text-[0.9375rem] font-bold text-primary-foreground hover:bg-primary/90"
              >
                {copy.shop.label}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
              {copy.whatsapp ? (
                <a
                  href={`https://wa.me/${copy.whatsapp}`}
                  className="inline-flex h-[3.375rem] items-center gap-2.5 rounded-full border border-primary px-[26px] text-[0.9375rem] font-bold hover:bg-primary hover:text-primary-foreground"
                >
                  <MessageCircle aria-hidden="true" className="size-[18px]" />
                  Chat on WhatsApp
                </a>
              ) : null}
            </div>
          </div>

          <form action={action} className="min-w-0 flex-[0_1_440px]" noValidate>
            <label
              htmlFor="news-email"
              className="block text-[0.8125rem] font-bold tracking-[0.04em]"
            >
              {copy.newsletterLabel}
            </label>
            <div className="mt-3 flex gap-2 border-b-[1.5px] border-primary pb-1.5">
              <input
                id="news-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="Your email address"
                defaultValue={state.values?.email}
                aria-invalid={error ? true : undefined}
                aria-describedby="news-note"
                className="h-[46px] min-w-0 flex-1 border-0 bg-transparent text-base outline-offset-4 placeholder:text-muted-foreground"
              />
              <button
                type="submit"
                disabled={pending}
                className="h-[46px] cursor-pointer rounded-full bg-highlight px-[22px] text-sm font-bold text-offer-foreground hover:bg-highlight/90 disabled:opacity-60"
              >
                Subscribe
              </button>
            </div>
            <p id="news-note" className="mt-2.5 text-xs text-muted-foreground">
              {copy.newsletterNote}
            </p>
            <p role="status" aria-live="polite" className="mt-2 min-h-5 text-sm font-medium">
              {state.status === "success" ? state.message : null}
            </p>
            {error || (state.status === "error" && state.message) ? (
              <p role="alert" className="text-sm text-destructive">
                {error ?? state.message}
              </p>
            ) : null}
          </form>
        </div>
      </div>
    </section>
  )
}
