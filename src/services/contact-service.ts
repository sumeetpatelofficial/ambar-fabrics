import "server-only"
import { z } from "zod"
import { connectDb } from "@/lib/db/mongoose"
import { ValidationError } from "@/lib/errors"
import { contactMessageEmail } from "@/lib/email/templates"
import { SiteSettings } from "@/models/site-settings"
import { enqueueEmail } from "@/services/job-service"
import { createHash } from "node:crypto"

export const contactSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(80, "Use at most 80 characters."),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
  message: z
    .string()
    .trim()
    .min(10, "Write at least 10 characters.")
    .max(3000, "Use at most 3,000 characters.")
    .refine((v) => (v.match(/https?:\/\//gi) ?? []).length <= 2, "Please leave out web links."),
})

/** Where messages go and what shows on the contact page, from the shop's settings. */
export async function getContactDetails(): Promise<{
  email?: string
  phone?: string
  addressLines: string[]
}> {
  await connectDb()
  const s = await SiteSettings.findOne({ key: "default" })
    .select({ store: 1 })
    .lean<{ store: { email?: string; phone?: string; addressLines: string[] } }>()
  return { email: s?.store.email, phone: s?.store.phone, addressLines: s?.store.addressLines ?? [] }
}

/** Passes a visitor's message to the shop's email through the outbox. Refuses when no address is set. */
export async function sendContactMessage(input: z.infer<typeof contactSchema>): Promise<void> {
  const { email } = await getContactDetails()
  if (!email)
    throw new ValidationError(
      "Messages cannot be sent from here yet. Please use the phone number shown."
    )
  // The same message sent twice (a double click) is queued once.
  const key = createHash("sha256")
    .update(`${input.email}\n${input.message}`)
    .digest("hex")
    .slice(0, 32)
  await enqueueEmail(
    contactMessageEmail({
      to: email,
      name: input.name,
      email: input.email,
      message: input.message,
    }),
    `contact:${key}`
  )
}
