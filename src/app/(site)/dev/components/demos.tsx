"use client"

import { toast } from "sonner"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/storefront/confirm-dialog"

export function ToastDemo() {
  return (
    <div className="flex flex-wrap gap-3">
      <Button
        onClick={() =>
          toast.success("Added to your bag", { description: "Handloom cotton, 2.5 m" })
        }
      >
        Added to bag
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          toast.error("That length is not available", {
            description: "Only 1.5 m is left in stock.",
          })
        }
      >
        Show an error
      </Button>
      <Button variant="outline" onClick={() => toast("Coupon applied")}>
        Plain message
      </Button>
    </div>
  )
}

export function ConfirmDemo() {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline">
          <Trash2 aria-hidden="true" data-icon="inline-start" />
          Remove item
        </Button>
      }
      title="Remove this item?"
      description="Handloom cotton, 2.5 m will be taken out of your bag. Your other items stay."
      confirmLabel="Remove item"
      destructive
      onConfirm={() => {
        toast.success("Removed from your bag")
      }}
    />
  )
}
