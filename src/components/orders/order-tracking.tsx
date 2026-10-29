import { SHIPMENT_LABEL } from "@/lib/shipping/status"
import type { ShipmentView } from "@/services/shipping-service"

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso))

/** Where the parcel is, newest step first. */
export function OrderTracking({ shipment }: { shipment: ShipmentView }) {
  return (
    <section aria-labelledby="tracking" className="flex flex-col gap-3">
      <h2 id="tracking" className="text-xl">
        Tracking
      </h2>
      <p className="text-sm">
        {shipment.courier}, tracking number{" "}
        <span className="tabular font-medium">{shipment.awb}</span>
        {shipment.trackingUrl ? (
          <>
            {" "}
            (
            <a
              href={shipment.trackingUrl}
              rel="noopener noreferrer"
              target="_blank"
              className="underline underline-offset-4"
            >
              courier tracking page
            </a>
            )
          </>
        ) : null}
      </p>
      <ol className="flex flex-col gap-2 border-l pl-4 text-sm">
        {[...shipment.events].reverse().map((e, i) => (
          <li
            key={`${e.status}-${e.at}`}
            className={i === 0 ? "font-medium" : "text-muted-foreground"}
          >
            {SHIPMENT_LABEL[e.status]}
            <span className="block text-xs font-normal text-muted-foreground">
              {when(e.at)}
              {e.location ? `, ${e.location}` : ""}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
