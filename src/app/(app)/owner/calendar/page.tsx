import {
  WholeCakeCalendarPage,
  resolveCalendarMonthParams,
} from "@/workspaces/owner/calendar/WholeCakeCalendarPage";
import {
  CALENDAR_RETURN_POSITION_PARAM,
  CALENDAR_RETURN_POSITION_VALUE,
} from "@/workspaces/owner/calendar/calendar-return-position";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    year?: string;
    month?: string;
    view?: string;
    matrix?: string;
    focus?: string;
    rp?: string;
  }>;
};

export default async function OwnerCalendarRoute({ searchParams }: PageProps) {
  const params = await searchParams;
  const { year, month, view, matrixMode, focusToday } =
    resolveCalendarMonthParams(params);
  const restorePosition =
    params[CALENDAR_RETURN_POSITION_PARAM] === CALENDAR_RETURN_POSITION_VALUE;

  return (
    <WholeCakeCalendarPage
      focusToday={focusToday}
      matrixMode={matrixMode}
      month={month}
      restorePosition={restorePosition}
      view={view}
      year={year}
    />
  );
}
