import { z } from "zod"
import { INDIAN_STATES } from "@/config/addresses"
import { normalizeIndianMobile } from "@/lib/phone"

const text = (label: string, max: number) =>
  z.string().trim().min(1, `Enter ${label}.`).max(max, `Use ${max} characters or fewer.`)
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use ${max} characters or fewer.`)
    .optional()
    .transform((v) => (v ? v : undefined))

const mobile = z
  .string()
  .trim()
  .min(1, "Enter a mobile number.")
  .transform((v, ctx) => {
    const normalized = normalizeIndianMobile(v)
    if (!normalized)
      ctx.addIssue({ code: "custom", message: "Enter a 10-digit Indian mobile number." })
    return normalized ?? ""
  })

export const profileSchema = z.object({
  name: text("your name", 80),
  phone: z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) return undefined
      const normalized = normalizeIndianMobile(v)
      if (!normalized)
        ctx.addIssue({ code: "custom", message: "Enter a 10-digit Indian mobile number." })
      return normalized ?? undefined
    }),
  marketingEmail: z
    .union([z.literal("on"), z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((v) => v === "on" || v === "true" || v === true),
})

export const addressSchema = z.object({
  label: optionalText(30),
  fullName: text("the recipient's name", 80),
  phone: mobile,
  line1: text("the first line of the address", 120),
  line2: optionalText(120),
  landmark: optionalText(120),
  city: text("the city or town", 60),
  state: z.enum(INDIAN_STATES, { error: "Choose a state." }),
  pincode: z
    .string()
    .trim()
    .regex(/^[1-9]\d{5}$/, "Enter a 6-digit PIN code."),
  makeDefault: z
    .union([z.literal("on"), z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((v) => v === "on" || v === "true" || v === true),
})

export type ProfileInput = z.infer<typeof profileSchema>
export type AddressInput = z.infer<typeof addressSchema>
