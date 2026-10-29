/**
 * Indian mobile numbers. Accepts "98765 43210", "+91 98765-43210", "09876543210"; returns the ten digits,
 * or null if it is not a valid mobile number (they start with 6, 7, 8 or 9).
 */
export function normalizeIndianMobile(input: string): string | null {
  const digits = input.replace(/[\s\-().]/g, "")
  const match = /^(?:\+?91|0)?([6-9]\d{9})$/.exec(digits)
  return match?.[1] ?? null
}

export const toE164 = (tenDigits: string) => `+91${tenDigits}`
