import type { CollectionBoardTab } from "@/workspaces/collection/eligibility";
import { collectionDateNavHref } from "@/workspaces/collection/date";

type CollectionWorkspaceNavProps = {
  active: CollectionBoardTab;
  boardDate: string;
};

const TABS: { id: CollectionBoardTab; label: string }[] = [
  { id: "ready", label: "Ready" },
  { id: "pickup", label: "Pickup" },
  { id: "delivery", label: "Delivery" },
  { id: "dine_in", label: "Dine-In" },
  { id: "completed", label: "Completed" },
  { id: "history", label: "History" },
];

export function CollectionWorkspaceNav({
  active,
  boardDate,
}: CollectionWorkspaceNavProps) {
  const base =
    "inline-flex min-h-11 items-center justify-center rounded-xl px-3 text-sm font-medium transition sm:px-4";
  const idle = `${base} text-skyline hover:text-ink hover:bg-mist`;
  const on = `${base} bg-ink text-mist`;

  return (
    <nav
      aria-label="Collection sections"
      className="border-fog flex flex-wrap gap-1 border-b pb-3"
    >
      {TABS.map((tab) => (
        <a
          className={active === tab.id ? on : idle}
          href={collectionDateNavHref(boardDate, tab.id)}
          key={tab.id}
        >
          {tab.label}
        </a>
      ))}
    </nav>
  );
}
