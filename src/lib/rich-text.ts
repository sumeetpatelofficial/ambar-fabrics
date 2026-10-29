/**
 * The small, safe markup used for information pages. It produces a plain structure (never HTML), so the page
 * can render it with ordinary React elements and nothing typed by an editor can ever run as code.
 *
 *   blank line         starts a new paragraph
 *   ## Heading         a heading
 *   - item             a bullet list (consecutive lines)
 *   [label](/path)     a link on this site;  [label](https://...) a link elsewhere (https only)
 */
export type Inline = { text: string } | { link: string; href: string; external: boolean }
export type Block =
  | { type: "heading"; text: string }
  | { type: "paragraph"; content: Inline[] }
  | { type: "list"; items: Inline[][] }

const LINK = /\[([^\]\n]{1,100})\]\(((?:\/(?!\/)[^\s)]*)|(?:https:\/\/[^\s)]{1,300}))\)/g

export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  let last = 0
  for (const m of text.matchAll(LINK)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) })
    const href = m[2]!
    out.push({ link: m[1]!, href, external: href.startsWith("https://") })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}

export function parseRichText(source: string): Block[] {
  const blocks: Block[] = []
  for (const chunk of source.replace(/\r\n?/g, "\n").split(/\n{2,}/)) {
    const lines = chunk.split("\n").map((l) => l.trimEnd())
    let paragraph: string[] = []
    let list: Inline[][] = []
    const flush = () => {
      if (paragraph.length)
        blocks.push({ type: "paragraph", content: parseInline(paragraph.join(" ").trim()) })
      if (list.length) blocks.push({ type: "list", items: list })
      paragraph = []
      list = []
    }
    for (const line of lines) {
      if (!line.trim()) continue
      const heading = /^##\s+(.+)$/.exec(line)
      const bullet = /^-\s+(.+)$/.exec(line)
      if (heading) {
        flush()
        blocks.push({ type: "heading", text: heading[1]!.trim() })
      } else if (bullet) {
        if (paragraph.length) flush()
        list.push(parseInline(bullet[1]!.trim()))
      } else {
        if (list.length) flush()
        paragraph.push(line.trim())
      }
    }
    flush()
  }
  return blocks
}
