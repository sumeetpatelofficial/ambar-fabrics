/**
 * Sample navigation, shaped as data so the header, mobile drawer and footer render from one source.
 * From Phase 3 this comes from the Category tree and SiteSettings (admin-editable); the category names
 * below are placeholders to be confirmed with the store owner.
 */
export type NavLink = { label: string; href: string }
export type NavGroup = { heading: string; links: NavLink[] }
export type NavItem = {
  label: string
  href: string
  groups?: NavGroup[]
  note?: { title: string; body: string }
  emphasis?: "sale"
}

export const mainNav: NavItem[] = [
  {
    label: "Fabrics",
    href: "/categories/fabrics",
    groups: [
      {
        heading: "By fabric",
        links: [
          { label: "Cotton", href: "/categories/fabrics/cotton-fabrics" },
          { label: "Crepe", href: "/categories/fabrics/crepe-fabrics" },
          { label: "Modal silk", href: "/categories/fabrics/modal-silk-fabrics" },
          { label: "Chinon", href: "/categories/fabrics/chinon-fabrics" },
          { label: "Tissue", href: "/categories/fabrics/tissue-fabrics" },
        ],
      },
      {
        heading: "Across the shop",
        links: [
          { label: "Every fabric", href: "/fabrics" },
          { label: "Every print", href: "/prints" },
        ],
      },
      {
        heading: "Trims",
        links: [
          { label: "Lace and borders", href: "/categories/fabrics/lace-and-borders" },
          { label: "Latkan and tassels", href: "/categories/fabrics/latkan-and-tassels" },
        ],
      },
    ],
    note: {
      title: "Sold by the metre",
      body: "Choose the length you need, in half-metre steps, and we cut it for you.",
    },
  },
  {
    label: "Dupattas",
    href: "/categories/dupattas",
    groups: [
      {
        heading: "By craft",
        links: [
          { label: "Bandhani", href: "/categories/dupattas/bandhani-dupattas" },
          { label: "Ajrakh", href: "/categories/dupattas/ajrakh-dupattas" },
          { label: "Printed", href: "/categories/dupattas/printed-dupattas" },
          { label: "Plain and dyed", href: "/categories/dupattas/plain-dupattas" },
        ],
      },
    ],
  },
  { label: "Blouses", href: "/categories/blouses" },
  {
    label: "Ready-made",
    href: "/categories/ready-made",
    groups: [
      {
        heading: "Ready to wear",
        links: [
          { label: "Kurtis", href: "/categories/ready-made/kurtis" },
          { label: "Dresses", href: "/categories/ready-made/dresses" },
        ],
      },
    ],
  },
  { label: "Unstitched suits", href: "/categories/unstitched-suits" },
  { label: "New arrivals", href: "/new-arrivals" },
  { label: "Sale", href: "/sale", emphasis: "sale" },
]

export const footerNav: NavGroup[] = [
  {
    heading: "Shop",
    links: [
      { label: "New arrivals", href: "/new-arrivals" },
      { label: "Bestsellers", href: "/bestsellers" },
      { label: "Sale", href: "/sale" },
      { label: "All categories", href: "/categories" },
      { label: "By fabric", href: "/fabrics" },
      { label: "By print", href: "/prints" },
    ],
  },
  {
    heading: "Help",
    links: [
      { label: "Track your order", href: "/track-order" },
      { label: "Shipping", href: "/shipping-policy" },
      { label: "Returns and refunds", href: "/return-refund-policy" },
      { label: "Questions and answers", href: "/faq" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About us", href: "/about" },
      { label: "Contact", href: "/contact" },
    ],
  },
]

export const legalNav: NavLink[] = [
  { label: "Privacy policy", href: "/privacy-policy" },
  { label: "Terms and conditions", href: "/terms-and-conditions" },
]
