"use client"

import { LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { signOutAction } from "@/features/auth/actions"
import { useBag } from "@/stores/bag-store"
import { useWishlist } from "@/stores/wishlist-store"

/** Who is signed in, and the way out. Signing out also clears the browser's copy of the shopping bag and wishlist. */
export function UserCard({ name, role }: { name: string; role: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border p-3">
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
      >
        {name.trim().charAt(0).toUpperCase() || "A"}
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{role.replace("_", " ")}</p>
      </div>
      <form
        action={signOutAction}
        onSubmit={() => {
          useWishlist.getState().clear()
          useBag.getState().clear()
        }}
      >
        <Button type="submit" variant="ghost" size="icon" aria-label="Sign out">
          <LogOut aria-hidden="true" className="size-4" />
        </Button>
      </form>
    </div>
  )
}
