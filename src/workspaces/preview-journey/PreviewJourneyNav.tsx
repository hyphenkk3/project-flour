import Link from "next/link";
import {
  journeyWorkspaceHref,
  type JourneyStep,
  type JourneyWorkspace,
} from "@/workspaces/preview-journey/journey";

type PreviewJourneyNavProps = {
  step: JourneyStep;
  current: JourneyWorkspace;
};

const ITEMS: { id: JourneyWorkspace; label: string }[] = [
  { id: "website", label: "Website" },
  { id: "customer_operations", label: "Customer Operations" },
  { id: "bakery", label: "Bakery" },
  { id: "collection", label: "Collection" },
];

export function PreviewJourneyNav({ step, current }: PreviewJourneyNavProps) {
  return (
    <nav className="border-fog/80 border-b bg-white/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-2 overflow-x-auto px-5 py-2 sm:px-8">
        <Link
          className="text-skyline hover:text-ink shrink-0 text-[11px] font-medium tracking-[0.16em] uppercase"
          href="/preview"
        >
          Hub
        </Link>
        <span className="text-fog shrink-0">/</span>
        {ITEMS.map((item) => {
          const active = item.id === current;
          return (
            <Link
              className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition ${
                active ? "bg-ink text-mist" : "text-skyline hover:text-ink"
              }`}
              href={journeyWorkspaceHref(item.id, step)}
              key={item.id}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
