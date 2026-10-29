import { notFound } from "next/navigation"
import { PageTitle, staffPage } from "@/components/admin/staff-page"
import { PageForm } from "@/components/admin/page-form"
import { NotFoundError } from "@/lib/errors"
import { getPageAdmin } from "@/services/content-service"

export default staffPage<{ params: Promise<{ slug: string }> }>(
  "content:write",
  async ({ actor, props }) => {
    const { slug } = await props.params
    try {
      const page = await getPageAdmin(actor, slug)
      return (
        <>
          <PageTitle
            title={page.title}
            crumbs={[{ label: "Pages", href: "/admin/pages" }, { label: page.title }]}
          />
          <PageForm
            slug={page.slug}
            title={page.title}
            description={page.description}
            body={page.body}
            edited={page.edited}
          />
        </>
      )
    } catch (error) {
      if (error instanceof NotFoundError) notFound()
      throw error
    }
  }
)
