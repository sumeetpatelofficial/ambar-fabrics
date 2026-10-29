import Image from "next/image"
import Link from "next/link"
import { cn } from "cn"
import { siteDefaults } from "@/config/site"

/** The Ambar logo (mark and lettering in one file). The link's name is the brand name. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center", className)}>
      <Image
        src="/webLogo.svg"
        alt={siteDefaults.name}
        width={1116}
        height={259}
        // An SVG is already as small as it gets; the image optimiser does not process it.
        unoptimized
        priority
        className="h-9 w-auto sm:h-10"
      />
    </Link>
  )
}
