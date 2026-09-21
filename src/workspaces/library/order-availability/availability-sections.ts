export const AVAILABILITY_CAPACITY_SECTION_ID = "production-capacity-heading";
export const AVAILABILITY_WAITING_LIST_SECTION_ID = "waiting-list-heading";
export const AVAILABILITY_OVERVIEW_SECTION_ID = "availability-overview-heading";
export const AVAILABILITY_RECENT_SECTION_ID = "recent-capacity-changes-heading";

export const AVAILABILITY_WORKSPACE_SECTIONS = [
  {
    id: AVAILABILITY_CAPACITY_SECTION_ID,
    label: "Production Capacity",
  },
  {
    id: AVAILABILITY_WAITING_LIST_SECTION_ID,
    label: "Waiting List",
  },
  {
    id: AVAILABILITY_OVERVIEW_SECTION_ID,
    label: "Availability Overview",
  },
  {
    id: AVAILABILITY_RECENT_SECTION_ID,
    label: "Recent Changes",
  },
] as const;

export function isAvailabilitySectionId(id: string): boolean {
  return AVAILABILITY_WORKSPACE_SECTIONS.some((section) => section.id === id);
}

export function bakeryAvailabilityHref(input: {
  month?: string;
  date?: string;
  overviewFrom?: string;
  wlCake?: string;
  wlSize?: string;
  wlStatus?: string;
  hash?: string;
}): string {
  const params = new URLSearchParams();
  const month = input.month?.trim() ?? "";
  const date = input.date?.trim().slice(0, 10) ?? "";
  const overviewFrom = input.overviewFrom?.trim().slice(0, 10) ?? "";
  const wlCake = input.wlCake?.trim() ?? "";
  const wlSize = input.wlSize?.trim() ?? "";
  const wlStatus = input.wlStatus?.trim() ?? "";
  if (month) params.set("month", month);
  if (date) params.set("date", date);
  if (overviewFrom) params.set("overviewFrom", overviewFrom);
  if (wlCake) params.set("wlCake", wlCake);
  if (wlSize) params.set("wlSize", wlSize);
  if (wlStatus) params.set("wlStatus", wlStatus);
  const query = params.toString();
  const path = query ? `/bakery/availability?${query}` : "/bakery/availability";
  const hash = input.hash?.replace(/^#/, "") ?? "";
  return hash ? `${path}#${hash}` : path;
}
