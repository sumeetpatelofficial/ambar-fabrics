import { PageTitle, staffPage } from "@/components/admin/staff-page"
import { DeleteRedirectButton, RedirectForm } from "@/components/admin/redirect-forms"
import { listRedirects } from "@/services/seo-service"

export default staffPage<object>("content:write", async ({ actor }) => {
  const redirects = await listRedirects(actor)
  return (
    <>
      <PageTitle title="Redirects" crumbs={[{ label: "Redirects" }]} />
      <p className="mb-6 max-w-2xl text-sm text-muted-foreground">
        When a product, category or collection is removed or renamed, point its old address to the
        new one so links and search results keep working. A product whose web address you change in
        the admin gets one automatically.
      </p>
      <RedirectForm />
      <h2 className="mt-10 mb-3 text-2xl">Current redirects</h2>
      {redirects.length === 0 ? (
        <p className="text-muted-foreground">None yet.</p>
      ) : (
        <ul className="divide-y border-y">
          {redirects.map((r) => (
            <li
              key={String(r._id)}
              className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
            >
              <p>
                <span className="font-medium">{r.fromPath}</span> to{" "}
                <span className="font-medium">{r.toPath}</span>
                <span className="text-muted-foreground">
                  , {r.statusCode === 301 ? "permanent" : "temporary"}
                </span>
              </p>
              <DeleteRedirectButton id={String(r._id)} from={r.fromPath} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
})
