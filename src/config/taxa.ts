/** The two master lists products draw from: what the cloth is (fabric) and how it is decorated (print). */
export const TAXON_KINDS = ["fabric", "print"] as const
export type TaxonKind = (typeof TAXON_KINDS)[number]
