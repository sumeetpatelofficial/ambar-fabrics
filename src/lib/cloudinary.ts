import { createHash } from "node:crypto"

/**
 * Signed uploads. The browser sends the photograph straight to Cloudinary; our server only signs the request,
 * so the API secret never leaves the server and nobody can upload without being signed in as staff.
 * Cloudinary's rule: sort the parameters by name, join them as name=value with &, add the API secret, take SHA-1.
 */
export function signUploadParams(
  params: Record<string, string | number>,
  apiSecret: string
): string {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&")
  return createHash("sha1")
    .update(toSign + apiSecret)
    .digest("hex")
}

export const UPLOAD_FOLDER = "ambar/products"
export const ALLOWED_FORMATS = "jpg,jpeg,png,webp,avif"
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

export type UploadTicket = {
  cloudName: string
  apiKey: string
  timestamp: number
  folder: string
  allowedFormats: string
  signature: string
}

export function createUploadTicket(
  config: { cloudName: string; apiKey: string; apiSecret: string },
  now = Date.now()
): UploadTicket {
  const timestamp = Math.floor(now / 1000)
  const signature = signUploadParams(
    { allowed_formats: ALLOWED_FORMATS, folder: UPLOAD_FOLDER, timestamp },
    config.apiSecret
  )
  return {
    cloudName: config.cloudName,
    apiKey: config.apiKey,
    timestamp,
    folder: UPLOAD_FOLDER,
    allowedFormats: ALLOWED_FORMATS,
    signature,
  }
}
