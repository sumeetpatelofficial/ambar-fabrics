const IST_OFFSET_MS = 5.5 * 3600 * 1000

/** India's financial year runs April to March: 14 October 2026 is "2026-27", 15 February 2027 is also "2026-27". */
export function financialYear(date: Date): string {
  const local = new Date(date.getTime() + IST_OFFSET_MS)
  const year = local.getUTCFullYear()
  const start = local.getUTCMonth() >= 3 ? year : year - 1
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`
}
