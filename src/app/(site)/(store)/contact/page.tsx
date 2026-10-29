import { connection } from "next/server"
import { ContactForm } from "@/components/content/contact-form"
import { ContentPageView } from "@/components/content/content-page"
import { pageMetadata } from "@/components/content/page-metadata"
import { getContactDetails } from "@/services/contact-service"
import { Suspense } from "react"

export const generateMetadata = () => pageMetadata("contact")

async function Details() {
  await connection()
  const d = await getContactDetails()
  return (
    <>
      {d.email || d.phone || d.addressLines.length ? (
        <address className="mt-6 flex max-w-prose flex-col gap-1 not-italic">
          {d.email ? (
            <a href={`mailto:${d.email}`} className="underline underline-offset-4">
              {d.email}
            </a>
          ) : null}
          {d.phone ? (
            <a
              href={`tel:${d.phone.replace(/[^\d+]/g, "")}`}
              className="underline underline-offset-4"
            >
              {d.phone}
            </a>
          ) : null}
          {d.addressLines.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </address>
      ) : null}
      {d.email ? <ContactForm /> : null}
    </>
  )
}

export default function ContactPage() {
  return (
    <ContentPageView slug="contact">
      <Suspense fallback={null}>
        <Details />
      </Suspense>
    </ContentPageView>
  )
}
