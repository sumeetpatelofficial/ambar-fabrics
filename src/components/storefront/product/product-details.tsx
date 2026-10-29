import Link from "next/link"
import type { ReactNode } from "react"
import type { ProductDetailDTO } from "@/features/catalog/types"

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function width(mm: number) {
  const cm = Math.round(mm / 10)
  return `${cm} cm (${Math.round(mm / 25.4)} in)`
}

/** Fabric facts and care, then what happens on returns. All content is visible on the page (and to search engines). */
export function ProductDetails({ product }: { product: ProductDetailDTO }) {
  const a = product.attributes
  const rows: [string, ReactNode][] = [
    ...(product.fabric
      ? [
          [
            "Fabric",
            <Link
              key="fabric"
              href={`/fabrics/${product.fabric.slug}`}
              className="underline underline-offset-4"
            >
              {product.fabric.name}
            </Link>,
          ] as [string, ReactNode],
        ]
      : a.fabricType
        ? [["Fabric", titleCase(a.fabricType)] as [string, ReactNode]]
        : []),
    ...(a.composition
      ? [["Composition", a.composition] as [string, ReactNode]]
      : a.material
        ? [["Material", titleCase(a.material)] as [string, string]]
        : []),
    ...(product.print
      ? [
          [
            "Print",
            <Link
              key="print"
              href={`/prints/${product.print.slug}`}
              className="underline underline-offset-4"
            >
              {product.print.name}
            </Link>,
          ] as [string, ReactNode],
        ]
      : a.pattern
        ? [["Pattern", titleCase(a.pattern)] as [string, ReactNode]]
        : []),
    ...(a.widthMm ? [["Width", width(a.widthMm)] as [string, string]] : []),
    ...(a.origin ? [["Made in", a.origin] as [string, string]] : []),
    ...(a.occasion.length
      ? [["Occasion", a.occasion.map(titleCase).join(", ")] as [string, string]]
      : []),
  ]
  const paragraphs = product.description?.split(/\n{2,}/).filter(Boolean) ?? []

  return (
    <div className="flex flex-col gap-8 border-t pt-8">
      {paragraphs.length > 0 ? (
        <section aria-labelledby="about" className="flex flex-col gap-3">
          <h2 id="about" className="text-2xl">
            About this piece
          </h2>
          {paragraphs.map((p, i) => (
            <p key={i} className="max-w-prose leading-relaxed text-pretty text-muted-foreground">
              {p}
            </p>
          ))}
        </section>
      ) : null}

      {rows.length > 0 ? (
        <section aria-labelledby="facts" className="flex flex-col gap-3">
          <h2 id="facts" className="text-2xl">
            Fabric details
          </h2>
          <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2 text-[0.95rem]">
            {rows.map(([term, value]) => (
              <div key={term} className="contents">
                <dt className="text-muted-foreground">{term}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {a.careInstructions.length > 0 ? (
        <section aria-labelledby="care" className="flex flex-col gap-3">
          <h2 id="care" className="text-2xl">
            Care
          </h2>
          <ul className="list-disc pl-5 text-[0.95rem] text-muted-foreground">
            {a.careInstructions.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="returns" className="flex flex-col gap-3">
        <h2 id="returns" className="text-2xl">
          Delivery and returns
        </h2>
        <p className="max-w-prose text-[0.95rem] text-pretty text-muted-foreground">
          {product.returnable
            ? "This item can be returned within the return window. "
            : product.variants[0]?.unit.kind === "length"
              ? "Cut to the length you choose, so this item cannot be returned unless it arrives faulty. "
              : "This item cannot be returned unless it arrives faulty. "}
          Read the{" "}
          <Link href="/return-refund-policy" className="underline underline-offset-4">
            returns and refunds policy
          </Link>{" "}
          and the{" "}
          <Link href="/shipping-policy" className="underline underline-offset-4">
            shipping policy
          </Link>
          .
        </p>
      </section>
    </div>
  )
}
