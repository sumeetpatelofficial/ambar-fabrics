import type { Metadata, Viewport } from "next"
import localFont from "next/font/local"
import { siteDefaults } from "@/config/site"
import { publicEnv } from "@/lib/env/public"
import { Providers } from "@/components/providers"
import "./globals.css"

// Self-hosted (see ./fonts/README.md): no network access at build time, no requests to Google.
const hanken = localFont({
  src: "./fonts/hanken-grotesk-latin-wght-normal.woff2",
  variable: "--font-hanken",
  weight: "100 900",
  display: "swap",
})
// Instrument Serif: the shop's display face (regular and italic; the italic carries the second phrase of headlines).
const instrument = localFont({
  src: [
    { path: "./fonts/instrument-serif-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/instrument-serif-latin-400-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-instrument",
  display: "swap",
})
// Gilda Display is kept for the staff area, which keeps its own look.
const gilda = localFont({
  src: "./fonts/gilda-display-latin-400-normal.woff2",
  variable: "--font-gilda",
  weight: "400",
  display: "swap",
})

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.NEXT_PUBLIC_APP_URL),
  title: { default: siteDefaults.name, template: `%s | ${siteDefaults.name}` },
  description: siteDefaults.tagline,
}

export const viewport: Viewport = {
  themeColor: "#f5efe4",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-IN"
      className={`${hanken.variable} ${instrument.variable} ${gilda.variable} h-full`}
    >
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:absolute focus:top-2 focus:left-2"
        >
          Skip to content
        </a>
        {/* The shop's frame is added by (site)/layout.tsx; the admin area has its own. */}
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
