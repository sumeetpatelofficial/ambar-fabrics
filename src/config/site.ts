/**
 * Temporary static defaults for the shell. From Phase 3 the store name, contact details, navigation
 * and policies come from the SiteSettings document (editable in /admin/settings), and this file is
 * reduced to fallbacks. Do not add business facts (address, GSTIN, prices) here.
 */
export const siteDefaults = {
  name: "Ambar",
  tagline: "Fabrics and clothing, chosen with care",
  announcement: "Free shipping on orders above the free-shipping threshold",
} as const
