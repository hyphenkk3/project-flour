/**
 * Home cockpit greeting — Asia/Singapore wall clock, no extra data fetching.
 */

const TIME_ZONE = "Asia/Singapore";

export type HomeGreetingPeriod = "morning" | "afternoon" | "evening";

export function homeGreetingPeriodFromHour(hour: number): HomeGreetingPeriod {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  return "evening";
}

export function singaporeHourOfDay(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);
  let hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  if (hour === 24) hour = 0;
  return hour;
}

const SALUTATION: Record<HomeGreetingPeriod, string> = {
  morning: "Good morning",
  afternoon: "Good afternoon",
  evening: "Good evening",
};

export function homeGreetingTitle(
  displayName: string,
  now: Date = new Date(),
): string {
  const period = homeGreetingPeriodFromHour(singaporeHourOfDay(now));
  return `${SALUTATION[period]}, ${displayName}`;
}
