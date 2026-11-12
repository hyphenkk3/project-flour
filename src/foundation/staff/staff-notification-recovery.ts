export type StaffNotificationRecoveryCursor = {
  createdAt: string;
  id: string;
};

export type RecoverableStaffNotificationEvent = {
  id: string;
  created_at: string;
  code: string;
  [key: string]: unknown;
};

export const STAFF_NOTIFICATION_RECOVERY_WINDOW_MS = 15 * 60 * 1000;
export const STAFF_NOTIFICATION_RECOVERY_PAGE_SIZE = 25;
export const STAFF_NOTIFICATION_RECOVERY_MAX_EVENTS = 100;
export const STAFF_NOTIFICATION_RECOVERY_MAX_DELIVERED_PER_RUN = 5;
export const STAFF_NOTIFICATION_RECOVERY_START_ID =
  "00000000-0000-0000-0000-000000000000";
const RECOVERY_SKIP_NOTICE_TTL_MS = 24 * 60 * 60 * 1000;

const MAX_RECOVERY_PAGES = Math.ceil(
  STAFF_NOTIFICATION_RECOVERY_MAX_EVENTS /
    STAFF_NOTIFICATION_RECOVERY_PAGE_SIZE,
);

export type StaffNotificationRecoveryResult = {
  status: "complete" | "incomplete" | "failed";
  cursor: StaffNotificationRecoveryCursor;
  recovered: number;
  olderEventsSkipped: boolean;
  futureCursorReset: boolean;
};

function cursorTime(cursor: StaffNotificationRecoveryCursor): number {
  return Date.parse(cursor.createdAt);
}

export function compareStaffNotificationCursors(
  left: StaffNotificationRecoveryCursor,
  right: StaffNotificationRecoveryCursor,
): number {
  const timeDifference = cursorTime(left) - cursorTime(right);
  if (timeDifference !== 0) return timeDifference;
  const leftId = left.id.toLowerCase();
  const rightId = right.id.toLowerCase();
  return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
}

export function isStaffNotificationRecoveryCursor(
  value: unknown,
): value is StaffNotificationRecoveryCursor {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StaffNotificationRecoveryCursor>;
  return (
    typeof candidate.createdAt === "string" &&
    Number.isFinite(Date.parse(candidate.createdAt)) &&
    typeof candidate.id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      candidate.id,
    )
  );
}

export function staffNotificationRecoveryStorageKey(staffId: string): string {
  return `wos-staff-notification-cursor:${staffId}`;
}

function recoverySkipNoticeStorageKey(staffId: string): string {
  return `wos-staff-notification-recovery-skip:${staffId}`;
}

export function markStaffNotificationRecoverySkipNotice(
  staffId: string,
  at = Date.now(),
): void {
  if (typeof window === "undefined" || !staffId) return;
  try {
    window.localStorage.setItem(
      recoverySkipNoticeStorageKey(staffId),
      String(at),
    );
  } catch {
    // The current recovery status still reports the skipped window.
  }
}

export function hasRecentStaffNotificationRecoverySkipNotice(
  staffId: string,
  now = Date.now(),
): boolean {
  if (typeof window === "undefined" || !staffId) return false;
  try {
    const key = recoverySkipNoticeStorageKey(staffId);
    const raw = window.localStorage.getItem(key);
    if (!raw) return false;
    const at = Number(raw);
    if (
      !Number.isFinite(at) ||
      at > now ||
      now - at > RECOVERY_SKIP_NOTICE_TTL_MS
    ) {
      window.localStorage.removeItem(key);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function loadStaffNotificationRecoveryCursor(
  staffId: string,
): StaffNotificationRecoveryCursor | null {
  if (typeof window === "undefined" || !staffId) return null;
  try {
    const raw = window.localStorage.getItem(
      staffNotificationRecoveryStorageKey(staffId),
    );
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStaffNotificationRecoveryCursor(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveStaffNotificationRecoveryCursor(
  staffId: string,
  cursor: StaffNotificationRecoveryCursor,
  options?: { reset?: boolean },
): boolean {
  if (typeof window === "undefined" || !staffId) return false;
  try {
    const key = staffNotificationRecoveryStorageKey(staffId);
    const currentRaw = window.localStorage.getItem(key);
    let current: unknown = null;
    try {
      current = currentRaw ? JSON.parse(currentRaw) : null;
    } catch {
      // A malformed cursor is discarded; the next valid cursor replaces it.
    }
    const next =
      !options?.reset && isStaffNotificationRecoveryCursor(current)
        ? compareStaffNotificationCursors(current, cursor) > 0
          ? current
          : cursor
        : cursor;
    window.localStorage.setItem(key, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

export async function recoverStaffNotificationEvents(input: {
  staffId: string;
  cursor: StaffNotificationRecoveryCursor | null;
  startedAt: number;
  now?: number;
  fetchPage: (input: {
    after: StaffNotificationRecoveryCursor;
    since: string;
    until: string;
    limit: number;
  }) => Promise<{
    events: RecoverableStaffNotificationEvent[] | null;
    error: unknown | null;
  }>;
  deliver: (event: RecoverableStaffNotificationEvent) => Promise<void>;
  saveCursor: (
    staffId: string,
    cursor: StaffNotificationRecoveryCursor,
    options?: { reset?: boolean },
  ) => boolean | Promise<boolean>;
}): Promise<StaffNotificationRecoveryResult> {
  const now = input.now ?? Date.now();
  const since = new Date(
    now - STAFF_NOTIFICATION_RECOVERY_WINDOW_MS,
  ).toISOString();
  const until = new Date(now).toISOString();
  let olderEventsSkipped = false;
  let futureCursorReset = false;
  let cursor = input.cursor;

  if (!cursor) {
    // A first-time listener starts near mount time instead of replaying the
    // staff notification history. The overlap covers DB/client clock skew.
    cursor = {
      createdAt: new Date(input.startedAt - 5_000).toISOString(),
      id: STAFF_NOTIFICATION_RECOVERY_START_ID,
    };
  }

  if (Date.parse(cursor.createdAt) < Date.parse(since)) {
    cursor = {
      createdAt: since,
      id: STAFF_NOTIFICATION_RECOVERY_START_ID,
    };
    olderEventsSkipped = true;
  }
  if (Date.parse(cursor.createdAt) > Date.parse(until)) {
    cursor = { createdAt: since, id: STAFF_NOTIFICATION_RECOVERY_START_ID };
    futureCursorReset = true;
  }

  let initialCursorSaved = false;
  try {
    initialCursorSaved = await input.saveCursor(input.staffId, cursor, {
      reset: futureCursorReset,
    });
  } catch {
    initialCursorSaved = false;
  }
  if (!initialCursorSaved) {
    return {
      status: "failed",
      cursor,
      recovered: 0,
      olderEventsSkipped,
      futureCursorReset,
    };
  }

  let recovered = 0;

  for (let pageIndex = 0; pageIndex < MAX_RECOVERY_PAGES; pageIndex += 1) {
    let page: Awaited<ReturnType<typeof input.fetchPage>>;
    try {
      page = await input.fetchPage({
        after: cursor,
        since,
        until,
        limit: STAFF_NOTIFICATION_RECOVERY_PAGE_SIZE,
      });
    } catch {
      return {
        status: "failed",
        cursor,
        recovered,
        olderEventsSkipped,
        futureCursorReset,
      };
    }

    if (page.error || !page.events) {
      return {
        status: "failed",
        cursor,
        recovered,
        olderEventsSkipped,
        futureCursorReset,
      };
    }

    if (page.events.length > STAFF_NOTIFICATION_RECOVERY_PAGE_SIZE) {
      return {
        status: "failed",
        cursor,
        recovered,
        olderEventsSkipped,
        futureCursorReset,
      };
    }

    let pageCursor = cursor;
    for (const event of page.events) {
      const nextCursor = { createdAt: event.created_at, id: event.id };
      if (
        !isStaffNotificationRecoveryCursor(nextCursor) ||
        Date.parse(event.created_at) < Date.parse(since) ||
        Date.parse(event.created_at) > Date.parse(until) ||
        compareStaffNotificationCursors(nextCursor, pageCursor) <= 0
      ) {
        return {
          status: "failed",
          cursor,
          recovered,
          olderEventsSkipped,
          futureCursorReset,
        };
      }
      pageCursor = nextCursor;
    }

    for (const event of page.events) {
      const nextCursor = { createdAt: event.created_at, id: event.id };

      try {
        await input.deliver(event);
      } catch {
        return {
          status: "failed",
          cursor,
          recovered,
          olderEventsSkipped,
          futureCursorReset,
        };
      }

      let nextCursorSaved = false;
      try {
        nextCursorSaved = await input.saveCursor(input.staffId, nextCursor);
      } catch {
        nextCursorSaved = false;
      }
      if (!nextCursorSaved) {
        return {
          status: "failed",
          cursor,
          recovered,
          olderEventsSkipped,
          futureCursorReset,
        };
      }

      cursor = nextCursor;
      recovered += 1;

      if (recovered >= STAFF_NOTIFICATION_RECOVERY_MAX_DELIVERED_PER_RUN) {
        let nextPage: Awaited<ReturnType<typeof input.fetchPage>>;
        try {
          nextPage = await input.fetchPage({
            after: cursor,
            since,
            until,
            limit: 1,
          });
        } catch {
          return {
            status: "failed",
            cursor,
            recovered,
            olderEventsSkipped,
            futureCursorReset,
          };
        }
        if (nextPage.error || !nextPage.events) {
          return {
            status: "failed",
            cursor,
            recovered,
            olderEventsSkipped,
            futureCursorReset,
          };
        }
        return {
          status: nextPage.events.length > 0 ? "incomplete" : "complete",
          cursor,
          recovered,
          olderEventsSkipped,
          futureCursorReset,
        };
      }
    }

    if (page.events.length < STAFF_NOTIFICATION_RECOVERY_PAGE_SIZE) {
      return {
        status: "complete",
        cursor,
        recovered,
        olderEventsSkipped,
        futureCursorReset,
      };
    }
  }

  // One bounded probe distinguishes an exact page boundary from a backlog
  // that exceeds the recovery cap. The cursor remains at the last processed
  // event so an explicit retry can continue without replaying prior items.
  let probe: Awaited<ReturnType<typeof input.fetchPage>>;
  try {
    probe = await input.fetchPage({ after: cursor, since, until, limit: 1 });
  } catch {
    return {
      status: "failed",
      cursor,
      recovered,
      olderEventsSkipped,
      futureCursorReset,
    };
  }
  if (probe.error || !probe.events) {
    return {
      status: "failed",
      cursor,
      recovered,
      olderEventsSkipped,
      futureCursorReset,
    };
  }

  return {
    status: probe.events.length > 0 ? "incomplete" : "complete",
    cursor,
    recovered,
    olderEventsSkipped,
    futureCursorReset,
  };
}
