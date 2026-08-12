import Link from "next/link";
import {
  bakeryDateNavHref,
  bakeryPlusTwoYmd,
  bakeryTodayYmd,
  bakeryTomorrowYmd,
} from "@/workspaces/bakery/date";

type BakeryDateNavProps = {
  selectedDate: string;
};

function chipClass(active: boolean): string {
  return active
    ? "bg-ink text-mist inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-medium"
    : "border-fog text-ink hover:border-skyline inline-flex min-h-11 items-center justify-center rounded-xl border bg-white px-4 text-sm font-medium transition";
}

export function BakeryDateNav({ selectedDate }: BakeryDateNavProps) {
  const today = bakeryTodayYmd();
  const tomorrow = bakeryTomorrowYmd();
  const plusTwo = bakeryPlusTwoYmd();
  const isQuick =
    selectedDate === today ||
    selectedDate === tomorrow ||
    selectedDate === plusTwo;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-2">
        <Link className={chipClass(selectedDate === today)} href={bakeryDateNavHref(today)}>
          Today
        </Link>
        <Link
          className={chipClass(selectedDate === tomorrow)}
          href={bakeryDateNavHref(tomorrow)}
        >
          Tomorrow
        </Link>
        <Link
          className={chipClass(selectedDate === plusTwo)}
          href={bakeryDateNavHref(plusTwo)}
        >
          +2
        </Link>
      </div>
      <form action="/bakery" className="flex min-h-11 items-center gap-2" method="get">
        <label className="text-skyline text-sm" htmlFor="bakery-date">
          Date
        </label>
        <input
          className="border-fog text-ink min-h-11 rounded-xl border bg-white px-3 text-sm"
          defaultValue={selectedDate}
          id="bakery-date"
          name="date"
          type="date"
        />
        <button
          className={chipClass(!isQuick)}
          type="submit"
        >
          Go
        </button>
      </form>
    </div>
  );
}
