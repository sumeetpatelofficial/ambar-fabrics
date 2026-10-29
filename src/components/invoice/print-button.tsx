"use client"

import { Printer } from "lucide-react"
import { Button } from "@/components/ui/button"

/** Opens the browser's print window. Choosing "Save as PDF" there keeps a copy. */
export function PrintButton() {
  return (
    <Button type="button" onClick={() => window.print()}>
      <Printer aria-hidden="true" className="size-4" /> Print or save as PDF
    </Button>
  )
}
