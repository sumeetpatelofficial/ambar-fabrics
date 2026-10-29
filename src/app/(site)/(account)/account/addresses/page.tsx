import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { MapPin } from "lucide-react"
import { AccountSkeleton } from "@/components/account/account-skeleton"
import { AddressForm } from "@/components/account/address-form"
import { DeleteAddressButton } from "@/components/account/delete-address-button"
import { Button, buttonVariants } from "@/components/ui/button"
import { EmptyState } from "@/components/storefront/empty-state"
import { setDefaultAddressAction } from "@/features/account/actions"
import { requireUser, toActor } from "@/lib/auth/session"
import { MAX_ADDRESSES_PER_USER } from "@/config/addresses"
import { listAddresses } from "@/services/account-service"

export const metadata: Metadata = { title: "Your addresses" }

async function Content({ searchParams }: Pick<PageProps<"/account/addresses">, "searchParams">) {
  const user = await requireUser("/account/addresses")
  const params = await searchParams
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const addresses = await listAddresses(toActor(user))
  const editing = addresses.find((a) => a.id === one(params.edit))
  const adding = one(params.new) !== undefined && addresses.length < MAX_ADDRESSES_PER_USER

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-4xl">Your addresses</h1>
        {!adding && !editing && addresses.length < MAX_ADDRESSES_PER_USER ? (
          <Link href="/account/addresses?new" className={buttonVariants()}>
            Add an address
          </Link>
        ) : null}
      </header>

      {adding ? <AddressForm /> : null}
      {editing ? <AddressForm address={editing} /> : null}

      {addresses.length === 0 && !adding ? (
        <EmptyState
          icon={MapPin}
          title="No saved addresses"
          description="Save an address and checkout will fill it in for you."
          action={
            <Link href="/account/addresses?new" className={buttonVariants()}>
              Add an address
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {addresses.map((a) => (
            <li key={a.id} className="flex flex-col gap-3 border p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-sans text-lg font-medium">{a.label || a.fullName}</h2>
                {a.isDefault ? (
                  <span className="bg-secondary px-2 py-1 text-xs">Default</span>
                ) : null}
              </div>
              <address className="text-[0.95rem] leading-relaxed text-muted-foreground not-italic">
                {a.fullName}
                <br />
                {a.line1}
                {a.line2 ? <>, {a.line2}</> : null}
                {a.landmark ? (
                  <>
                    <br />
                    Near {a.landmark}
                  </>
                ) : null}
                <br />
                {a.city}, {a.state} {a.pincode}
                <br />
                Phone {a.phone}
              </address>
              <div className="flex flex-wrap items-center gap-1">
                <Link
                  href={`/account/addresses?edit=${a.id}`}
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                  Edit
                </Link>
                {!a.isDefault ? (
                  <form action={setDefaultAddressAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      Make default
                    </Button>
                  </form>
                ) : null}
                <DeleteAddressButton id={a.id} summary={`${a.fullName}, ${a.line1}`} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function AddressesPage({ searchParams }: PageProps<"/account/addresses">) {
  return (
    <Suspense fallback={<AccountSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  )
}
