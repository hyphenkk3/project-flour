import Link from "next/link";
import {
  collectionPlusTwoYmd,
  collectionDateNavHref,
  collectionTodayYmd,
  collectionTomorrowYmd,
} from "@/workspaces/collection/date";
import type { CollectionBoardTab } from "@/workspaces/collection/eligibility";

type CollectionDateNavProps = {
  selectedDate: string;
  tab?: CollectionBoardTab;
};

function chipClass(active: boolean): string {
  return active
    ? "bg-ink text-mist inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-medium"
    : "border-fog text-ink hover:border-skyline inline-flex min-h-11 items-center justify-center rounded-xl border bg-white px-4 text-sm font-medium transition";
}

export function CollectionDateNav({
  selectedDate,
  tab = "ready",
}: CollectionDateNavProps) {
  const today = collectionTodayYmd();
  const tomorrow = collectionTomorrowYmd();
  const plusTwo = collectionPlusTwoYmd();
  const isQuick =
    selectedDate === today ||
    selectedDate === tomorrow ||
    selectedDate === plusTwo;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-2">
        <Link
          className={chipClass(selectedDate === today)}
          href={collectionDateNavHref(today, tab)}
        >
          Today
        </Link>
        <Link
          className={chipClass(selectedDate === tomorrow)}
          href={collectionDateNavHref(tomorrow, tab)}
        >
          Tomorrow
        </Link>
        <Link
          className={chipClass(selectedDate === plusTwo)}
          href={collectionDateNavHref(plusTwo, tab)}
        >
          +2
        </Link>
      </div>
      <form
        action="/collection"
        className="flex min-h-11 items-center gap-2"
        method="get"
      >
        {tab !== "ready" ? (
          <input name="tab" type="hidden" value={tab} />
        ) : null}
        <label className="text-skyline text-sm" htmlFor="collection-date">
          Date
        </label>
        <input
          className="border-fog text-ink min-h-11 rounded-xl border bg-white px-3 text-sm"
          defaultValue={selectedDate}
          id="collection-date"
          name="date"
          type="date"
        />
        <button className={chipClass(!isQuick)} type="submit">
          Go
        </button>
      </form>
    </div>
  );
}
