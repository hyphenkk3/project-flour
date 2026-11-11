const POSTGRES_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isFreshPickReminderEventId(value: unknown): value is string {
  return typeof value === "string" && POSTGRES_UUID.test(value);
}

/** Process only validated IDs returned by the Fresh Pick reminder candidate query. */
export async function dispatchSpecificFreshPickReminderEvents<T>(input: {
  eventIds: unknown;
  dispatch: (eventId: string) => Promise<T>;
}): Promise<{ attempted: number; rejected: number; results: T[] }> {
  if (!Array.isArray(input.eventIds)) {
    return { attempted: 0, rejected: 1, results: [] };
  }

  const results: T[] = [];
  let rejected = 0;
  const seen = new Set<string>();
  for (const candidate of input.eventIds) {
    const eventId =
      typeof candidate === "object" &&
      candidate !== null &&
      "event_id" in candidate
        ? (candidate as { event_id?: unknown }).event_id
        : candidate;
    if (!isFreshPickReminderEventId(eventId) || seen.has(eventId)) {
      rejected += 1;
      continue;
    }
    seen.add(eventId);
    results.push(await input.dispatch(eventId));
  }

  return { attempted: results.length, rejected, results };
}
