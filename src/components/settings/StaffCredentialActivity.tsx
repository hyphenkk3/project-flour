"use client";

import { useState, useTransition } from "react";
import { formatDateTime } from "@/lib/dates";
import { loadOlderStaffCredentialActivityAction } from "@/app/(app)/settings/staff/actions";
import type {
  StaffCredentialActivityCursor,
  StaffCredentialActivityItem,
  StaffCredentialActivityPage,
} from "@/foundation/staff/credential-audit";

type StaffCredentialActivityProps = {
  page: StaffCredentialActivityPage;
};

function ActivityEvents({ events }: { events: StaffCredentialActivityItem[] }) {
  return (
    <ul className="mt-4 space-y-4">
      {events.map((event) => {
        const sameStaff = event.actorName === event.subjectName;
        return (
          <li
            className="border-fog border-t pt-4 first:border-t-0 first:pt-0"
            key={event.id}
          >
            <time className="text-skyline text-xs" dateTime={event.createdAt}>
              {formatDateTime(event.createdAt)}
            </time>
            <p className="text-ink mt-1 text-sm font-medium">{event.label}</p>
            {sameStaff ? (
              <p className="text-skyline mt-1 text-sm">{event.actorName}</p>
            ) : (
              <>
                <p className="text-skyline mt-1 text-sm">
                  Performed by {event.actorName}
                </p>
                <p className="text-skyline text-sm">For {event.subjectName}</p>
              </>
            )}
            {event.detail ? (
              <p className="text-ink mt-1 text-sm">{event.detail}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function StaffCredentialActivity({
  page,
}: StaffCredentialActivityProps) {
  const [events, setEvents] = useState(page.events);
  const [cursor, setCursor] = useState<StaffCredentialActivityCursor | null>(
    page.nextCursor,
  );
  const [hasMore, setHasMore] = useState(page.hasMore);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function loadOlder() {
    if (!cursor || isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await loadOlderStaffCredentialActivityAction(cursor);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEvents((current) => {
        const seen = new Set(current.map((event) => event.id));
        return [
          ...current,
          ...result.page.events.filter((event) => !seen.has(event.id)),
        ];
      });
      setCursor(result.page.nextCursor);
      setHasMore(result.page.hasMore);
    });
  }

  return (
    <section className="border-fog rounded-xl border bg-white p-5">
      <details className="group">
        <summary className="text-ink focus-visible:outline-signal flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 [&::-webkit-details-marker]:hidden">
          <span>
            Credential activity
            <span className="text-skyline ml-2 text-xs font-normal">
              {events.length === 0
                ? "No events"
                : `Latest ${events.length} events`}
            </span>
          </span>
          <span className="text-signal shrink-0 text-xs font-medium">
            <span className="group-open:hidden">Show history</span>
            <span className="hidden group-open:inline">Hide history</span>
          </span>
        </summary>
        <p className="text-skyline mt-1 text-sm">
          Successful staff username, email, password, and Passkey changes. Older
          entries stay available below.
        </p>
        {events.length === 0 ? (
          <p className="text-skyline mt-4 text-sm">
            No credential changes have been recorded yet.
          </p>
        ) : (
          <ActivityEvents events={events} />
        )}
        {error ? (
          <p className="text-status-danger mt-3 text-sm" role="alert">
            {error}
          </p>
        ) : null}
        {hasMore ? (
          <button
            className="border-fog text-ink hover:border-signal mt-4 min-h-11 rounded-lg border px-3 py-2 text-sm font-medium transition disabled:opacity-60"
            disabled={isPending}
            onClick={loadOlder}
            type="button"
          >
            {isPending ? "Loading older events…" : "Load 5 older events"}
          </button>
        ) : null}
        {isPending ? (
          <span className="sr-only" role="status">
            Loading older credential activity
          </span>
        ) : null}
      </details>
    </section>
  );
}
