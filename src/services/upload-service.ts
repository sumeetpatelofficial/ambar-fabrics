import "server-only"
import { getServerEnv, isGroupConfigured, requireGroup } from "@/lib/env/server"
import { createUploadTicket, type UploadTicket } from "@/lib/cloudinary"
import { assertPermission, type Actor } from "@/lib/security/authorize"

/** A short-lived permission to upload one batch of photographs. Only staff who can edit the catalogue get one. */
export function getUploadTicket(actor: Actor): UploadTicket | null {
  assertPermission(actor, "catalog:write")
  getServerEnv()
  if (!isGroupConfigured("cloudinary")) return null
  const k = requireGroup("cloudinary")
  return createUploadTicket({
    cloudName: k.CLOUDINARY_CLOUD_NAME,
    apiKey: k.CLOUDINARY_API_KEY,
    apiSecret: k.CLOUDINARY_API_SECRET,
  })
}
