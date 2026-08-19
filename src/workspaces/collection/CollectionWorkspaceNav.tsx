import type { CollectionBoardTab } from "@/workspaces/collection/eligibility";
import { collectionDateNavHref } from "@/workspaces/collection/date";

type CollectionWorkspaceNavProps = {
  active: CollectionBoardTab;
  boardDate: string;
};

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
      aria-label="Pickup sections"
      className="border-fog flex flex-wrap gap-1 border-b pb-3"
    >
      <a
        className={active === "ready" ? on : idle}
        href={collectionDateNavHref(boardDate, "ready")}
      >
        Ready
      </a>
      <a
        className={active === "dine_in" ? on : idle}
        href={collectionDateNavHref(boardDate, "dine_in")}
      >
        Dine-in
      </a>
      <a
        className={active === "completed" ? on : idle}
        href={collectionDateNavHref(boardDate, "completed")}
      >
        Picked Up / Delivered
      </a>
      <a
        className={active === "history" ? on : idle}
        href={collectionDateNavHref(boardDate, "history")}
      >
        History
      </a>
    </nav>
  );
}
