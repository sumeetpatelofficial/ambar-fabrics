import Link from "next/link"
import { parseRichText, type Inline } from "@/lib/rich-text"

function Inlines({ items }: { items: Inline[] }) {
  return (
    <>
      {items.map((part, i) =>
        "text" in part ? (
          part.text
        ) : part.external ? (
          <a
            key={i}
            href={part.href}
            rel="noopener noreferrer"
            target="_blank"
            className="underline underline-offset-4"
          >
            {part.link}
          </a>
        ) : (
          <Link key={i} href={part.href} className="underline underline-offset-4">
            {part.link}
          </Link>
        )
      )}
    </>
  )
}

/** Renders the page markup as real elements. Text is always escaped by React; there is no raw HTML anywhere. */
export function RichText({ source }: { source: string }) {
  const blocks = parseRichText(source)
  return (
    <div className="flex max-w-prose flex-col gap-4 leading-relaxed">
      {blocks.map((b, i) =>
        b.type === "heading" ? (
          <h2 key={i} className="mt-4 text-2xl">
            {b.text}
          </h2>
        ) : b.type === "list" ? (
          <ul key={i} className="ml-5 list-disc space-y-1">
            {b.items.map((item, j) => (
              <li key={j}>
                <Inlines items={item} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={i}>
            <Inlines items={b.content} />
          </p>
        )
      )}
    </div>
  )
}
