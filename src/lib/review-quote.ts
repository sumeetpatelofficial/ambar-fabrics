/** A review's words shortened for the home page: whole words only, ending with an ellipsis. Pure. */
export function shortenQuote(body: string, max = 220): string {
  const text = body.replace(/\s+/g, " ").trim()
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const lastSpace = cut.lastIndexOf(" ")
  const base = (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:!?-]+$/, "")
  return `${base}…`
}
