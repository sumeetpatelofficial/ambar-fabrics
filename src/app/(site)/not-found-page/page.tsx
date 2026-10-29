import { notFound } from "next/navigation"

/**
 * Target of the proxy's rewrite for unknown catalogue URLs. It is prerendered, so Next serves it with a
 * real 404 status and the site's not-found UI.
 */
export default function NotFoundTarget() {
  notFound()
}
