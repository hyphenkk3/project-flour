import Link from "next/link";
import {
  bakeryOrderJourneyHref,
  collectionOrderJourneyHref,
  customerOperationsOrderJourneyHref,
  websiteJourneyHref,
  websiteOrderHref,
} from "@/workspaces/preview-journey/journey";

const STAGES = [
  {
    title: "Website",
    detail: "Browse Chocolate D’Amour and submit Amy’s preorder.",
    href: websiteJourneyHref("website"),
  },
  {
    title: "Customer Operations",
    detail: "Confirm, request payment, verify the receipt.",
    href: customerOperationsOrderJourneyHref("amy", "submitted"),
  },
  {
    title: "Bakery",
    detail: "Start production, pack, mark ready.",
    href: bakeryOrderJourneyHref("amy", "payment_verified"),
  },
  {
    title: "Collection",
    detail: "Guest arrives, verify, collect.",
    href: collectionOrderJourneyHref("amy", "ready_for_collection"),
  },
] as const;

export function JourneyHubPage() {
  return (
    <main className="bg-mist min-h-dvh">
      <header className="border-fog/70 border-b bg-white">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div>
            <p className="text-signal text-[11px] font-medium tracking-[0.2em] uppercase">
              Whitebird · Preview
            </p>
            <p className="font-display text-ink text-xl tracking-tight">
              Connected Order Journey
            </p>
          </div>
          <span className="border-fog text-skyline rounded-full border px-3 py-1 text-xs">
            V0.5-P11
          </span>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <h1 className="font-display text-ink text-4xl tracking-tight sm:text-5xl">
          One preorder, four workspaces
        </h1>
        <p className="text-skyline mt-4 text-base leading-relaxed sm:text-lg">
          Walk Amy Chen’s Chocolate D’Amour from the customer website through
          Customer Operations, Bakery, and Collection. Follow the primary
          buttons — you should not need to hunt for her order. Mock data only.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 items-center justify-center rounded-xl px-5 text-sm font-medium transition"
            href={websiteJourneyHref("website")}
          >
            Start on the website
          </Link>
          <Link
            className="border-fog text-ink hover:border-signal inline-flex min-h-12 items-center justify-center rounded-xl border bg-white px-5 text-sm font-medium transition"
            href={websiteOrderHref("website")}
          >
            Skip to preorder form
          </Link>
        </div>

        <ol className="mt-12 space-y-4">
          {STAGES.map((stage, index) => (
            <li key={stage.title}>
              <Link
                className="border-fog hover:border-signal/40 block rounded-2xl border bg-white p-5 transition"
                href={stage.href}
              >
                <p className="text-signal text-xs font-medium tracking-[0.16em] uppercase">
                  {index + 1}
                </p>
                <h2 className="font-display text-ink mt-1 text-2xl tracking-tight">
                  {stage.title}
                </h2>
                <p className="text-skyline mt-2 text-sm leading-relaxed">
                  {stage.detail}
                </p>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}
