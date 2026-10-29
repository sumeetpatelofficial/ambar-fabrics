"use client"

import { useId, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getUploadTicketAction } from "@/features/admin/actions"
import { MAX_UPLOAD_BYTES } from "@/lib/cloudinary"

const TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"]

/**
 * Sends photographs from this computer to Cloudinary and adds them to the product's list. The photograph
 * goes straight to Cloudinary; this site only signs the request. Each added photo gets a starting description
 * that should be made specific (it is what a screen reader says and what appears if the picture fails to load).
 */
export function ImageUploader({
  productName,
  onUploaded,
}: {
  productName: string
  onUploaded: (lines: string[]) => void
}) {
  const id = useId()
  const [status, setStatus] = useState("")
  const [problem, setProblem] = useState("")
  const [busy, setBusy] = useState(false)

  async function upload(files: FileList | null) {
    if (!files?.length) return
    setProblem("")
    setStatus("")
    const chosen = [...files]
    const bad = chosen.find((f) => !TYPES.includes(f.type) || f.size > MAX_UPLOAD_BYTES)
    if (bad) {
      setProblem(`${bad.name}: use a JPEG, PNG, WebP or AVIF photograph under 8 MB.`)
      return
    }
    setBusy(true)
    const asked = await getUploadTicketAction()
    if (!asked.ok) {
      setBusy(false)
      setProblem(asked.message)
      return
    }
    if (!asked.ticket) {
      setBusy(false)
      setProblem(
        "Photo upload is not set up yet. Paste Cloudinary addresses in the box below, or add the Cloudinary keys to turn upload on."
      )
      return
    }
    const t = asked.ticket
    const lines: string[] = []
    for (const [i, file] of chosen.entries()) {
      setStatus(`Uploading ${i + 1} of ${chosen.length}`)
      const body = new FormData()
      body.set("file", file)
      body.set("api_key", t.apiKey)
      body.set("timestamp", String(t.timestamp))
      body.set("folder", t.folder)
      body.set("allowed_formats", t.allowedFormats)
      body.set("signature", t.signature)
      try {
        const response = await fetch(
          `https://api.cloudinary.com/v1_1/${t.cloudName}/image/upload`,
          { method: "POST", body }
        )
        if (!response.ok) throw new Error(String(response.status))
        const result = (await response.json()) as { secure_url?: string }
        if (!result.secure_url?.startsWith("https://res.cloudinary.com/"))
          throw new Error("address")
        lines.push(`${result.secure_url} | ${productName || "Product"}, photograph ${i + 1}`)
      } catch {
        setProblem(`${file.name} could not be uploaded. Check your connection and try again.`)
      }
    }
    setBusy(false)
    setStatus(
      lines.length
        ? `${lines.length} added. Change each description to say what the photograph shows.`
        : ""
    )
    if (lines.length) onUploaded(lines)
  }

  return (
    <div className="flex flex-col gap-2 border p-4">
      <Label htmlFor={id} className="text-sm">
        Upload photographs
      </Label>
      <Input
        id={id}
        type="file"
        accept={TYPES.join(",")}
        multiple
        disabled={busy}
        onChange={(e) => void upload(e.target.files)}
      />
      <p role="status" className="min-h-5 text-sm text-muted-foreground">
        {status}
      </p>
      <p role="alert" className="text-sm text-destructive">
        {problem}
      </p>
    </div>
  )
}
