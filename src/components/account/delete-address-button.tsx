"use client"

import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/storefront/confirm-dialog"
import { deleteAddressAction } from "@/features/account/actions"

export function DeleteAddressButton({ id, summary }: { id: string; summary: string }) {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="sm">
          <Trash2 aria-hidden="true" className="size-4" />
          Delete
        </Button>
      }
      title="Delete this address?"
      description={`${summary} will be removed from your account. Orders already placed are not affected.`}
      confirmLabel="Delete address"
      destructive
      onConfirm={async () => {
        const data = new FormData()
        data.set("id", id)
        await deleteAddressAction(data)
      }}
    />
  )
}
