import { z } from "zod"

/** Plain text only: control characters removed, spacing tidied. React escapes it when shown. */
const clean = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim()

export const reviewInputSchema = z.object({
  rating: z.coerce
    .number()
    .int("Choose a rating from 1 to 5.")
    .min(1, "Choose a rating from 1 to 5.")
    .max(5, "Choose a rating from 1 to 5."),
  title: z
    .string()
    .max(80, "Use at most 80 characters.")
    .optional()
    .transform((v) => (v ? clean(v) : undefined))
    .transform((v) => v || undefined),
  body: z
    .string()
    .transform(clean)
    .pipe(
      z.string().min(10, "Write at least 10 characters.").max(1500, "Use at most 1,500 characters.")
    )
    .refine((v) => (v.match(/https?:\/\//gi) ?? []).length <= 1, "Please leave out web links."),
})
export type ReviewInput = z.infer<typeof reviewInputSchema>
