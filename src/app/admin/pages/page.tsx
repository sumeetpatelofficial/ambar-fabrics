import Link from "next/link"
import { PageTitle, staffPage } from "@/components/admin/staff-page"
import { listPagesAdmin } from "@/services/content-service"

export default staffPage<object>("content:write", async ({ actor }) => {
  const pages = await listPagesAdmin(actor)
  return (
    <>
      <PageTitle title="Pages" crumbs={[{ label: "Pages" }]} />
      <p className="mb-4 max-w-2xl text-sm text-muted-foreground">
        These are the information pages in the shop. They start with a first draft that you must
        read and change to match how your shop works. Have the privacy policy and terms checked by a
        lawyer before you launch.
      </p>
      <ul className="divide-y border-y">
        {pages.map((p) => (
          <li
            key={p.slug}
            className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
          >
            <div>
              <Link
                href={`/admin/pages/${p.slug}`}
                className="text-lg underline-offset-4 hover:underline"
              >
                {p.title}
              </Link>
              <p className="text-muted-foreground">/{p.slug}</p>
            </div>
            <p className={p.edited ? "" : "text-madder"}>
              {p.edited ? "Edited by you" : "Original draft, not yet reviewed"}
            </p>
          </li>
        ))}
      </ul>
    </>
  )
})
