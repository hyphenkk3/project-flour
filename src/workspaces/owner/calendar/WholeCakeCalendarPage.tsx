import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { canViewWholeCakeCalendar } from "@/engines/orders/delivery-finance-capabilities";
import { requireStaff } from "@/foundation/auth/session";
import { resolveCalendarMonthParams } from "@/workspaces/owner/calendar/calendar-url";
import { WholeCakeCalendar } from "@/workspaces/owner/calendar/WholeCakeCalendar";
import {
  listCalendarEntriesForMonth,
  listCalendarExtraMarkersForMonth,
} from "@/workspaces/owner/calendar/queries";
import type {
  CalendarMatrixMode,
  CalendarViewMode,
} from "@/workspaces/owner/calendar/types";
import { notFound } from "next/navigation";

export { resolveCalendarMonthParams };

export const dynamic = "force-dynamic";

type WholeCakeCalendarPageProps = {
  year: number;
  month: number;
  view: CalendarViewMode;
  matrixMode: CalendarMatrixMode;
  focusToday: boolean;
  restorePosition: boolean;
};

export async function WholeCakeCalendarPage({
  year,
  month,
  view,
  matrixMode,
  focusToday,
  restorePosition,
}: WholeCakeCalendarPageProps) {
  const staff = await requireStaff();
  if (!canViewWholeCakeCalendar(staff.role.code)) {
    notFound();
  }

  const [entries, extras] = await Promise.all([
    listCalendarEntriesForMonth(year, month),
    listCalendarExtraMarkersForMonth(year, month),
  ]);
  const canMutateCalendarOrderActions = staff.role.code === "owner";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          description="Production scan by fulfilment date. Matrix is cake×date density; EXTRA appears on prepared_on. Cakes and Orders remain available."
          title="Whole Cake Calendar"
        />
        <Link
          className="border-line text-ink hover:bg-mist inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg border px-4 text-sm font-medium"
          href="/owner"
        >
          Operations
        </Link>
      </div>
      <WholeCakeCalendar
        canMutateCalendarOrderActions={canMutateCalendarOrderActions}
        focusToday={focusToday}
        initialEntries={entries}
        initialExtras={extras}
        matrixMode={matrixMode}
        month={month}
        restorePosition={restorePosition}
        staffDisplayName={staff.displayName}
        view={view}
        year={year}
      />
    </div>
  );
}
