/**
 * Everything editable on the home page: copy, links, prices, photographs, the offer and reviews.
 * Components read from here and hold no text of their own. A photograph is optional: until a path is
 * given (a file under /public, or a Cloudinary address) a neutral coloured panel is drawn instead.
 */
export type Tint = "red" | "indigo" | "sage" | "gold"
export type Photo = { src: string; alt: string }
export type Pattern =
  | "sage"
  | "red"
  | "indigo"
  | "indigo-l"
  | "leaf"
  | "rose"
  | "gold"
  | "wine"
  | "border"
  | "bandhani"
  | "tissue"

export type HeroSlide = {
  eyebrow: string
  label: string
  line1: string
  line2: string
  /** Colour of the second (italic) line. */
  ink: string
  text: string
  cta: { label: string; href: string }
  tint: Tint
  /** The full-width background behind the whole hero while this slide shows. */
  tintBg: string
  /** The huge word behind the model, in a colour a little darker than the background. */
  ghost: { word: string; colour: string }
  /** The three small fabric swatches that float around the arch. */
  swatches: [Pattern, Pattern, Pattern]
  caption: string
  /** Shown on the small price card as "From ₹…". Leave out to hide the price line. */
  from?: string
  photo?: Photo
}

export type Look = {
  title: string
  kind: string
  desc: string
  fabricNote: string
  tint: Tint
  /** Three colour dots: the main cloth, the dupatta and the border. */
  colours: [string, string, string]
  from?: string
  href: string
  photo?: Photo
}

export type CategoryCopy = { title: string; sub: string; pattern: Pattern }

export type TurnBlock = {
  degrees: string
  view: string
  title: string
  body: string
  /** Up to two label and value pairs. Left out until the details are known. */
  details?: { label: string; value: string }[]
}

export type LookCard = {
  title: string
  fabric: string
  bg: string
  href: string
  photo?: Photo
}

export const home = {
  hero: {
    secondary: { label: "Explore fabrics", href: "/categories/fabrics" },
    slides: [
      {
        eyebrow: "The Festive Edit",
        label: "Festive edit",
        line1: "Draped in",
        line2: "colour.",
        ink: "#9E2F2A",
        text: "Bandhani, gota and tissue: ready-made anarkalis and suit sets, finished and ready to wear this season.",
        cta: { label: "Shop the edit", href: "/categories/ready-made" },
        tint: "red",
        tintBg: "#F3E6DC",
        ghost: { word: "Utsav", colour: "#EBD3C5" },
        swatches: ["bandhani", "red", "gold"],
        caption: "Gharchola bandhani anarkali",
      },
      {
        eyebrow: "Everyday Cotton",
        label: "Everyday cotton",
        line1: "Soft on",
        line2: "the skin.",
        ink: "#4F6B4A",
        text: "Hand block-printed cotton kurtas and co-ords, cut from the same fabrics we sell by the metre.",
        cta: { label: "Shop cotton", href: "/fabrics/cotton" },
        tint: "sage",
        tintBg: "#ECEFE6",
        ghost: { word: "Roz", colour: "#DCE3D2" },
        swatches: ["sage", "leaf", "indigo-l"],
        caption: "Block-print cotton co-ord",
      },
      {
        eyebrow: "Wedding Dupattas",
        label: "Wedding dupattas",
        line1: "The final",
        line2: "flourish.",
        ink: "#6E2E3E",
        text: "Tissue and bandhani dupattas with hand-finished tassels, to lift a plain suit into an occasion.",
        cta: { label: "Shop dupattas", href: "/categories/dupattas" },
        tint: "gold",
        tintBg: "#F3EBD6",
        ghost: { word: "Shaadi", colour: "#EADCBA" },
        swatches: ["tissue", "wine", "gold"],
        caption: "Tissue kurti with dupatta",
      },
    ] satisfies HeroSlide[],
  },

  wardrobe: {
    title: "The wardrobe,",
    titleEm: "one model",
    hint: "Keep scrolling: the outfit changes with you.",
    looks: [
      {
        title: "Bandhani anarkali",
        kind: "Ready-made",
        desc: "Hand tie-dyed bandhani with a gold gota border at the hem and a matching dupatta.",
        fabricNote: "Also sold as fabric, by the metre",
        tint: "red",
        colours: ["#9E2F2A", "#E0B04E", "#D7A23B"],
        href: "/categories/ready-made",
      },
      {
        title: "Ajrakh kurta set",
        kind: "Ready-made",
        desc: "Indigo and madder ajrakh print on modal silk, with straight pants and a contrast dupatta.",
        fabricNote: "Also sold as fabric, by the metre",
        tint: "indigo",
        colours: ["#22305A", "#A33A2C", "#E9DCC3"],
        href: "/prints/ajrakh",
      },
      {
        title: "Block-print co-ord",
        kind: "Ready-made",
        desc: "A relaxed kurta and pant in hand block-printed cotton, made for every day.",
        fabricNote: "Also sold as fabric, by the metre",
        tint: "sage",
        colours: ["#E9DFC9", "#8FA58A", "#4F6B4A"],
        href: "/fabrics/cotton",
      },
      {
        title: "Tissue kurti and dupatta",
        kind: "Ready-made",
        desc: "Gold tissue kurti with a wine dupatta, finished with hand-made tassels.",
        fabricNote: "Also sold as fabric, by the metre",
        tint: "gold",
        colours: ["#C9A55C", "#6E2E3E", "#F2E7CF"],
        href: "/categories/fabrics/tissue-fabrics",
      },
    ] satisfies Look[],
  },

  categories: {
    eyebrow: "Shop by category",
    title: "From the first metre",
    titleEm: "to the last tassel.",
    intro: "Fabric by the metre, ready-made outfits and every finishing touch in between.",
    allLabel: "All categories",
    /** The order of the cards, by category address. A category that does not exist in the shop is skipped. */
    order: [
      "fabrics",
      "ready-made",
      "unstitched-suits",
      "dupattas",
      "blouses",
      "latkan-and-tassels",
      "lace-and-borders",
    ],
    copy: {
      fabrics: {
        title: "Fabrics",
        sub: "Cotton, crepe, modal silk, chinon and tissue, by the metre",
        pattern: "sage",
      },
      "ready-made": {
        title: "Ready-made",
        sub: "Kurtis, dresses and co-ord sets",
        pattern: "indigo",
      },
      "unstitched-suits": {
        title: "Unstitched suits",
        sub: "Three-piece sets to tailor your way",
        pattern: "leaf",
      },
      dupattas: { title: "Dupattas", sub: "Bandhani, ajrakh, printed and plain", pattern: "red" },
      blouses: { title: "Blouses", sub: "Ready-made blouses and blouse pieces", pattern: "gold" },
      "latkan-and-tassels": {
        title: "Tassels and latkans",
        sub: "Finishing for dupattas and blouses",
        pattern: "wine",
      },
      "lace-and-borders": {
        title: "Laces and borders",
        sub: "Trims for the edge of anything",
        pattern: "border",
      },
    } as Record<string, CategoryCopy>,
  },

  turnaround: {
    eyebrow: "Every angle",
    title: "Turn it around",
    titleEm: "before you buy.",
    /** Turntable photographs in order (front, right, back, left), 24 to 36 frames. Empty until shot. */
    frames: [] as Photo[],
    fallbackAlt: "Model wearing the ajrakh kurta set, turning through 360 degrees",
    blocks: [
      {
        degrees: "0°",
        view: "Front",
        title: "Ajrakh modal kurta set",
        body: "Hand block-printed in indigo and madder red on modal silk, with a straight hem and a contrast dupatta.",
        details: [
          { label: "Fabric", value: "Modal silk" },
          { label: "Print", value: "Ajrakh block print" },
        ],
      },
      {
        degrees: "90°",
        view: "Side",
        title: "The fall of the fabric",
        body: "Modal silk drapes close without clinging. The side view shows how the kurta moves and where the slits sit.",
      },
      {
        degrees: "180°",
        view: "Back",
        title: "Dori tie and tassels",
        body: "A tie-up back neck finished with hand-made tassels, the same ones you can buy in Tassels and latkans.",
        details: [{ label: "Closure", value: "Dori tie" }],
      },
    ] satisfies TurnBlock[],
    final: {
      degrees: "360°",
      view: "Full turn",
      title: "Wear it ready, or stitch it your way",
      body: "Pick your size in the ready-made set, or buy the same ajrakh modal silk by the metre and have it tailored.",
      primary: { label: "Shop the set", href: "/categories/ready-made" },
      secondary: { label: "Fabric by the metre", href: "/prints/ajrakh" },
    },
  },

  lookbook: {
    title: "Looks in",
    titleEm: "motion",
    text: "A season of outfits on one model. Every look links to the piece, or to its fabric by the metre.",
    marquee:
      "Bandhani · Ajrakh · Chikankari · Leheriya · Kalamkari · Gota patti · Bandhani · Ajrakh · Chikankari · Leheriya · Kalamkari",
    /** Three columns of three cards. */
    columns: [
      [
        { title: "Leheriya suit set", fabric: "Chiffon", bg: "#D8E2DA", href: "/shop" },
        { title: "Ajrakh kurta set", fabric: "Modal silk", bg: "#CBD0DF", href: "/prints/ajrakh" },
        { title: "Gota patti kurti", fabric: "Chinon", bg: "#F0D7D6", href: "/shop" },
      ],
      [
        { title: "Chikankari kurta", fabric: "Cotton", bg: "#E8D8CF", href: "/fabrics/cotton" },
        {
          title: "Bandhani anarkali",
          fabric: "Georgette",
          bg: "#F0DFBA",
          href: "/prints/bandhani",
        },
        { title: "Festive suit set", fabric: "Crepe", bg: "#E8C9B5", href: "/shop" },
      ],
      [
        { title: "Kalamkari kurta", fabric: "Cotton", bg: "#EAD8C4", href: "/shop" },
        { title: "Block-print co-ord", fabric: "Cotton", bg: "#D4DCCB", href: "/fabrics/cotton" },
        {
          title: "Tissue kurti",
          fabric: "Tissue",
          bg: "#E6D6AE",
          href: "/categories/fabrics/tissue-fabrics",
        },
      ],
    ] as LookCard[][],
  },

  cutToOrder: {
    eyebrow: "Cut to order",
    title: "Buy only the length",
    titleEm: "you need.",
    text: "Every fabric is sold by the metre in 0.25 m steps. Scroll to unroll: the price updates as the length grows, so there is no arithmetic to do.",
    product: "Block print cotton",
    ratePerMetrePaise: 22_000,
    pattern: "rose" as Pattern,
  },

  newArrivals: {
    title: "New arrivals",
    linkLabel: "See all new arrivals",
    href: "/new-arrivals",
  },

  /**
   * The festive offer band. Its code, discount, end date and smallest order come from the coupon the owner
   * ticks "Show on the home page" on in Admin, Coupons; the band is not shown when there is none. Only the
   * wording around it lives here.
   */
  offer: {
    eyebrow: "This season only",
    /** Finishes "15% off ..." in the line that runs along the top. */
    what: "on your order",
    text: "Use the code at checkout. It applies to fabric by the metre as well, cut to your length at the offer price.",
    cta: { label: "Shop the offer", href: "/shop" },
  },

  /** The wording around the reviews. The reviews themselves are the shop's real approved reviews. */
  reviewsCopy: {
    eyebrow: "Customer reviews",
    title: "In their",
    titleEm: "own words",
  },

  closing: {
    title1: "Find your",
    title2: "fabric.",
    text: "Not sure how many metres a suit needs, or which fabric drapes best? Send us a message and we will help you choose before you buy.",
    shop: { label: "Shop fabrics", href: "/categories/fabrics" },
    /** International format without + or spaces, for example 919876543210. Leave empty to hide the button. */
    whatsapp: "",
    /** The year the shop started, shown on the round badge. Leave empty to leave "since" out. */
    sinceYear: "",
    newsletterLabel: "Get new arrivals and offers first",
    newsletterNote: "One email a week at most. Unsubscribe any time.",
  },

  footer: {
    tagline: "Fabrics and clothing,",
    taglineEm: "chosen with care.",
  },
}
