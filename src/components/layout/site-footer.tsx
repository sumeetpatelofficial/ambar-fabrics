import Link from "next/link"
import { siteDefaults } from "@/config/site"
import { footerNav, legalNav } from "@/config/navigation"
import { home } from "@/content/home"
import { CookieSettings } from "@/components/analytics/cookie-settings"
import { CurrentYear } from "./current-year"
import { FooterWordmark } from "./footer-wordmark"

/** Contact details, address and policy text come from SiteSettings once the admin exists (Phase 3/9). */
export function SiteFooter() {
  return (
    <footer className="mt-auto overflow-hidden bg-primary pt-24 pb-8 text-primary-foreground print:hidden">
      <div className="home-container">
        <div className="grid gap-10 max-md:grid-cols-2 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <p className="max-w-[18.75rem] font-display text-[1.875rem] leading-[1.15] max-md:col-span-2">
            {home.footer.tagline} <em>{home.footer.taglineEm}</em>
          </p>
          {footerNav.map((group) => (
            <nav key={group.heading} aria-label={group.heading}>
              <h2 className="mb-[18px] font-sans text-[0.8125rem] font-normal tracking-[0.14em] text-gold-dark uppercase">
                {group.heading}
              </h2>
              <ul className="flex flex-col gap-3 text-[0.9375rem]">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="inline-flex min-h-8 items-center text-primary-foreground/80 transition-colors hover:text-gold-dark"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* <FooterWordmark text="ambar" /> */}

        <div className="mt-9 flex flex-wrap justify-between gap-4 border-t border-primary-foreground/20 pt-5 text-[0.8125rem] text-primary-foreground/75">
          <p>
            © <CurrentYear /> {siteDefaults.name}
          </p>
          <ul className="flex flex-wrap gap-x-6">
            {legalNav.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="inline-flex min-h-8 items-center hover:text-gold-dark"
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <CookieSettings />
          </ul>
        </div>
      </div>
    </footer>
  )
}
