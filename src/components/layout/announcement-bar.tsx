import { siteDefaults } from "@/config/site"

export function AnnouncementBar() {
  return (
    <div className="bg-primary px-4 py-2 text-center text-[0.78rem] tracking-[0.02em] text-primary-foreground print:hidden">
      <p className="text-pretty">{siteDefaults.announcement}</p>
    </div>
  )
}
