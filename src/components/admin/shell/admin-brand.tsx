import Image from "next/image"
import Link from "next/link"

/** The shop's mark with "Admin" beside it. A plain link back to the dashboard, not to the shop. */
export function AdminBrand() {
  return (
    <Link href="/admin" className="flex items-center gap-2.5">
      <Image
        src="/brand/ambar-mark.png"
        alt=""
        width={36}
        height={36}
        className="size-9 rounded-lg"
      />
      <span className="flex flex-col leading-tight">
        <span className="font-display text-xl">Ambar</span>
        <span className="text-xs text-muted-foreground">Admin</span>
      </span>
    </Link>
  )
}
