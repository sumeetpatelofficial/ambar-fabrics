"use client"

import { useState } from "react"
import { Truck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { checkDeliveryAction } from "@/features/fulfilment/actions"

/** "Do you deliver to me?" Answered from the courier's own coverage, before anything goes in the bag. */
export function DeliveryCheck() {
  const [pin, setPin] = useState("")
  const [result, setResult] = useState<string>("")
  const [ok, setOk] = useState(true)
  const [busy, setBusy] = useState(false)

  async function check(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const r = await checkDeliveryAction(pin)
    setBusy(false)
    if ("error" in r) {
      setOk(false)
      setResult(r.error)
    } else if (r.serviceable) {
      setOk(true)
      setResult(
        r.etaDays ? `We deliver here, usually in about ${r.etaDays} days.` : "We deliver here."
      )
    } else {
      setOk(false)
      setResult("Sorry, we do not deliver to that PIN code yet.")
    }
  }

  return (
    <form onSubmit={check} className="flex flex-col gap-2 border-t pt-5">
      <Label htmlFor="delivery-pin" className="flex items-center gap-2 text-sm">
        <Truck aria-hidden="true" className="size-4" /> Check delivery
      </Label>
      <div className="flex max-w-xs gap-2">
        <Input
          id="delivery-pin"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={6}
          placeholder="PIN code"
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, ""))
            setResult("")
          }}
        />
        <Button type="submit" variant="outline" disabled={busy || pin.length !== 6}>
          Check
        </Button>
      </div>
      <p
        role="status"
        className={ok ? "min-h-5 text-sm text-primary" : "min-h-5 text-sm text-destructive"}
      >
        {result}
      </p>
    </form>
  )
}
