import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  clearStaffNotificationRecoveryPending,
  hasStaffNotificationRecoveryPending,
  hasRecentStaffNotificationRecoverySkipNotice,
  markStaffNotificationRecoveryPending,
  markStaffNotificationRecoverySkipNotice,
  recoverStaffNotificationEvents,
  STAFF_NOTIFICATION_RECOVERY_MAX_DELIVERED_PER_RUN,
  STAFF_NOTIFICATION_RECOVERY_PAGE_SIZE,
  STAFF_NOTIFICATION_RECOVERY_START_ID,
  STAFF_NOTIFICATION_RECOVERY_WINDOW_MS,
  type RecoverableStaffNotificationEvent,
  type StaffNotificationRecoveryCursor,
} from "../src/foundation/staff/staff-notification-recovery";
import {
  buildStaffNotificationToast,
  notificationDurationMs,
} from "../src/foundation/staff/staff-notification-engine";

const startedAt = Date.parse("2026-11-12T04:00:00.000Z");
const now = startedAt + 60_000;
const staffId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function makeEvents(count: number): RecoverableStaffNotificationEvent[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    created_at: new Date(startedAt + index).toISOString(),
    code: "new_order",
  }));
}

function sortEvents(events: RecoverableStaffNotificationEvent[]) {
  return [...events].sort((left, right) =>
    left.created_at === right.created_at
      ? left.id.localeCompare(right.id)
      : left.created_at.localeCompare(right.created_at),
  );
}

async function recoverAll(
  events: RecoverableStaffNotificationEvent[],
  initialCursor: StaffNotificationRecoveryCursor | null = null,
) {
  let cursor = initialCursor;
  const delivered: string[] = [];
  const pageSizes: number[] = [];
  const fetchPage = async ({
    after,
    since,
    until,
    limit,
  }: {
    after: StaffNotificationRecoveryCursor;
    since: string;
    until: string;
    limit: number;
  }) => {
    const rows = sortEvents(events).filter(
      (event) =>
        event.created_at >= since &&
        event.created_at <= until &&
        (event.created_at > after.createdAt ||
          (event.created_at === after.createdAt && event.id > after.id)),
    );
    pageSizes.push(limit);
    return { events: rows.slice(0, limit), error: null };
  };
  const result = await recoverStaffNotificationEvents({
    staffId,
    cursor,
    startedAt,
    now,
    fetchPage,
    deliver: async (event) => {
      delivered.push(event.id);
    },
    saveCursor: async (_staffId, next) => {
      cursor = next;
      return true;
    },
  });
  return { result, cursor, delivered, pageSizes };
}

const single = await recoverAll(makeEvents(1));
assert.equal(single.result.status, "complete");
assert.equal(
  single.result.recovered,
  1,
  "normal live/recovery event is delivered once",
);
assert.equal(
  single.cursor?.createdAt,
  makeEvents(1)[0]?.created_at,
  "first recovery cursor stops at the last presented event",
);

const exactBatch = await recoverAll(
  makeEvents(STAFF_NOTIFICATION_RECOVERY_MAX_DELIVERED_PER_RUN),
);

const sixEventBacklog = makeEvents(6);
const sixEventFirstPass = await recoverAll(sixEventBacklog);
assert.equal(sixEventFirstPass.result.status, "incomplete");
assert.equal(sixEventFirstPass.delivered.length, 5);
assert.equal(
  sixEventFirstPass.cursor?.id,
  sixEventBacklog[4]?.id,
  "six-item backlog leaves its cursor at the fifth delivered event",
);
const sixEventContinuation = await recoverAll(
  sixEventBacklog,
  sixEventFirstPass.cursor,
);
assert.equal(sixEventContinuation.result.status, "complete");
assert.deepEqual(
  sixEventContinuation.delivered,
  [sixEventBacklog[5]?.id],
  "continuation delivers only the remaining sixth event",
);
assert.equal(
  exactBatch.result.status,
  "complete",
  "one-row probe avoids asking for a retry when the bounded batch was the full backlog",
);

const many = makeEvents(24);
const firstPass = await recoverAll(many);
assert.equal(
  firstPass.result.status,
  "incomplete",
  "recovery yields after bounded visible batch",
);
assert.equal(
  firstPass.delivered.length,
  STAFF_NOTIFICATION_RECOVERY_MAX_DELIVERED_PER_RUN,
);
assert.equal(
  firstPass.cursor?.id,
  many[STAFF_NOTIFICATION_RECOVERY_MAX_DELIVERED_PER_RUN - 1]?.id,
  "five-item presentation cap never advances past an unpresented sixth event",
);
assert.ok(
  firstPass.pageSizes.every(
    (size) => size <= STAFF_NOTIFICATION_RECOVERY_PAGE_SIZE,
  ),
);
const secondPass = await recoverAll(many, firstPass.cursor);
assert.equal(secondPass.result.status, "incomplete");
const remainingPasses = [secondPass];
while (remainingPasses.at(-1)?.result.status === "incomplete") {
  const previous = remainingPasses.at(-1)!;
  remainingPasses.push(await recoverAll(many, previous.cursor));
  assert.ok(
    remainingPasses.length <= 6,
    "bounded retries eventually finish finite backlog",
  );
}
assert.equal(remainingPasses.at(-1)?.result.status, "complete");
assert.equal(
  new Set([firstPass, ...remainingPasses].flatMap((pass) => pass.delivered))
    .size,
  many.length,
  "retry resumes after multiple missed events without overlap duplicates",
);

const boundaryCursor = {
  createdAt: makeEvents(3)[0].created_at,
  id: makeEvents(3)[0].id,
};
const boundary = await recoverAll(makeEvents(3), boundaryCursor);
assert.equal(
  boundary.result.recovered,
  2,
  "cursor tie boundary skips only already-seen UUID",
);

const saved: StaffNotificationRecoveryCursor[] = [];
const failed = await recoverStaffNotificationEvents({
  staffId,
  cursor: null,
  startedAt,
  now,
  fetchPage: async () => ({ events: null, error: new Error("temporary") }),
  deliver: async () => assert.fail("failed read must not deliver"),
  saveCursor: async (_id, next) => {
    saved.push(next);
    return true;
  },
});
assert.equal(
  failed.status,
  "failed",
  "temporary recovery error is not success",
);
assert.equal(failed.recovered, 0);

const eventDeliveryFailure = await recoverStaffNotificationEvents({
  staffId,
  cursor: null,
  startedAt,
  now,
  fetchPage: async ({ after }) => ({
    events: [
      {
        id: "00000000-0000-4000-8000-000000000001",
        created_at: new Date(startedAt).toISOString(),
        code: "new_order",
      },
    ].filter(
      (event) =>
        event.created_at > after.createdAt ||
        (event.created_at === after.createdAt && event.id > after.id),
    ),
    error: null,
  }),
  deliver: async () => {
    throw new Error("toast presentation failed");
  },
  saveCursor: async (_id, next) => {
    saved.push(next);
    return true;
  },
});
assert.equal(eventDeliveryFailure.status, "failed");
assert.equal(eventDeliveryFailure.recovered, 0);
assert.equal(
  saved.at(-1)?.id,
  STAFF_NOTIFICATION_RECOVERY_START_ID,
  "cursor stays before an event whose presentation failed",
);

const thrownFetch = await recoverStaffNotificationEvents({
  staffId,
  cursor: null,
  startedAt,
  now,
  fetchPage: async () => {
    throw new Error("network unavailable");
  },
  deliver: async () => assert.fail("thrown read must not deliver"),
  saveCursor: async () => true,
});
assert.equal(
  thrownFetch.status,
  "failed",
  "thrown network error is visible as failure",
);

const failedCursorSave = await recoverStaffNotificationEvents({
  staffId,
  cursor: null,
  startedAt,
  now,
  fetchPage: async () => ({ events: [], error: null }),
  deliver: async () => {},
  saveCursor: async () => false,
});
assert.equal(
  failedCursorSave.status,
  "failed",
  "cursor persistence failure is visible",
);

let resetSavedCursor: StaffNotificationRecoveryCursor | null = {
  createdAt: new Date(now + 60_000).toISOString(),
  id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
};
let resetWasRequested = false;
const recoveredFromFutureCursor = await recoverStaffNotificationEvents({
  staffId,
  cursor: resetSavedCursor,
  startedAt,
  now,
  fetchPage: async ({ after, since }) => {
    assert.equal(
      after.createdAt,
      since,
      "future cursor clamps to lookback start",
    );
    return {
      events: [
        {
          id: "00000000-0000-4000-8000-000000000200",
          created_at: new Date(now - 1_000).toISOString(),
          code: "new_order",
        },
      ],
      error: null,
    };
  },
  deliver: async () => {},
  saveCursor: async (_id, next, options) => {
    resetWasRequested ||= options?.reset === true;
    if (
      options?.reset ||
      !resetSavedCursor ||
      next.createdAt > resetSavedCursor.createdAt
    ) {
      resetSavedCursor = next;
    }
    return true;
  },
});
assert.equal(recoveredFromFutureCursor.futureCursorReset, true);
assert.equal(recoveredFromFutureCursor.recovered, 1);
assert.equal(
  resetWasRequested,
  true,
  "future persisted cursor is explicitly reset",
);
assert.equal(
  resetSavedCursor?.id,
  "00000000-0000-4000-8000-000000000200",
  "recovery advances again from the processed event after reset",
);

const recoveryStorage = new Map<string, string>();
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    localStorage: {
      getItem: (key: string) => recoveryStorage.get(key) ?? null,
      setItem: (key: string, value: string) => recoveryStorage.set(key, value),
      removeItem: (key: string) => recoveryStorage.delete(key),
    },
  },
});
markStaffNotificationRecoverySkipNotice(staffId, now);
assert.equal(
  hasRecentStaffNotificationRecoverySkipNotice(staffId, now + 1),
  true,
  "15-minute skip warning survives page recovery while the backlog is retried",
);
assert.equal(
  hasRecentStaffNotificationRecoverySkipNotice(
    staffId,
    now + 24 * 60 * 60 * 1000 + 1,
  ),
  false,
  "skip warning expires after one day",
);

const interruptionBacklog = makeEvents(6);
const interruptionFirstPass = await recoverAll(interruptionBacklog);
let interruptionCursor = interruptionFirstPass.cursor;
markStaffNotificationRecoveryPending(staffId);
assert.equal(
  hasStaffNotificationRecoveryPending("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
  false,
  "pending recovery marker is isolated per staff member",
);
const offlineRetry = await recoverStaffNotificationEvents({
  staffId,
  cursor: interruptionCursor,
  startedAt,
  now,
  fetchPage: async () => ({ events: null, error: new Error("offline") }),
  deliver: async () => assert.fail("offline retry must not deliver"),
  saveCursor: async (_id, next) => {
    interruptionCursor = next;
    return true;
  },
});
assert.equal(offlineRetry.status, "failed");
assert.equal(
  interruptionCursor?.id,
  interruptionBacklog[4]?.id,
  "failed continuation preserves the cursor before the sixth event",
);
assert.equal(
  hasStaffNotificationRecoveryPending(staffId),
  true,
  "pending recovery survives an offline failure and page refresh",
);
const afterRefreshContinuation = await recoverAll(
  interruptionBacklog,
  interruptionCursor,
);
assert.deepEqual(
  afterRefreshContinuation.delivered,
  [interruptionBacklog[5]?.id],
  "retry after reconnect delivers the sixth event only",
);
clearStaffNotificationRecoveryPending(staffId);
assert.equal(
  hasStaffNotificationRecoveryPending(staffId),
  false,
  "successful completion clears the persisted continuation marker",
);
markStaffNotificationRecoveryPending(staffId);
const expiredPendingRecovery = await recoverStaffNotificationEvents({
  staffId,
  cursor: interruptionCursor,
  startedAt,
  now: now + STAFF_NOTIFICATION_RECOVERY_WINDOW_MS + 1,
  fetchPage: async () => ({ events: [], error: null }),
  deliver: async () => assert.fail("expired events must not be presented"),
  saveCursor: async () => true,
});
assert.equal(expiredPendingRecovery.status, "complete");
assert.equal(expiredPendingRecovery.olderEventsSkipped, true);
clearStaffNotificationRecoveryPending(staffId);
assert.equal(
  hasStaffNotificationRecoveryPending(staffId),
  false,
  "expired backlog is reported and does not leave a stale retry marker",
);
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: undefined,
});

const oversized = await recoverStaffNotificationEvents({
  staffId,
  cursor: null,
  startedAt,
  now,
  fetchPage: async ({ limit }) => ({
    events: makeEvents(limit + 1),
    error: null,
  }),
  deliver: async () => assert.fail("oversized page must not deliver"),
  saveCursor: async () => true,
});
assert.equal(oversized.status, "failed", "server over-return fails closed");

const unordered = await recoverStaffNotificationEvents({
  staffId,
  cursor: null,
  startedAt,
  now,
  fetchPage: async () => ({
    events: [makeEvents(2)[1], makeEvents(2)[0]],
    error: null,
  }),
  deliver: async () => assert.fail("unordered page must not advance cursor"),
  saveCursor: async (_id, next) => {
    saved.push(next);
    return true;
  },
});
assert.equal(unordered.status, "failed");
assert.equal(unordered.recovered, 0);
assert.equal(
  unordered.cursor.id,
  STAFF_NOTIFICATION_RECOVERY_START_ID,
  "unordered data is reported and never moves the cursor past unseen events",
);

const aged = await recoverStaffNotificationEvents({
  staffId,
  cursor: {
    createdAt: new Date(
      now - STAFF_NOTIFICATION_RECOVERY_WINDOW_MS - 1,
    ).toISOString(),
    id: "00000000-0000-0000-0000-000000000000",
  },
  startedAt,
  now,
  fetchPage: async () => ({ events: [], error: null }),
  deliver: async () => {},
  saveCursor: async () => true,
});
assert.equal(
  aged.olderEventsSkipped,
  true,
  "old cursor is bounded and disclosed",
);
assert.equal(aged.recovered, 0);

const future = await recoverAll([
  {
    id: "00000000-0000-4000-8000-000000000100",
    created_at: new Date(now + 1_000).toISOString(),
    code: "new_order",
  },
]);
assert.equal(
  future.result.recovered,
  0,
  "future-dated rows stay outside the recovery interval",
);

const listenerSource = readFileSync(
  resolve("src/components/shell/StaffNotificationListener.tsx"),
  "utf8",
);
assert.match(listenerSource, /\.from\("staff_notification_events"\)/);
assert.match(listenerSource, /\.gte\("created_at", since\)/);
assert.match(listenerSource, /\.lte\("created_at", until\)/);
assert.match(listenerSource, /\.order\("created_at", \{ ascending: true \}\)/);
assert.match(listenerSource, /\.order\("id", \{ ascending: true \}\)/);
assert.match(listenerSource, /\.limit\(limit\)/);
assert.match(listenerSource, /status === "SUBSCRIBED"/);
assert.match(listenerSource, /CHANNEL_ERROR/);
assert.match(listenerSource, /Retry recovery/);
assert.match(listenerSource, /hasStaffNotificationRecoveryPending\(staffId\)/);
assert.match(listenerSource, /recoveryPendingRef\.current/);
assert.match(listenerSource, /listenerState !== "recovering"/);
assert.match(listenerSource, /!recoveryRunning/);
assert.match(listenerSource, /updateRecoveryPending\(true\)/);
assert.match(listenerSource, /updateRecoveryPending\(false\)/);
assert.match(listenerSource, /preference\.webMode/);
assert.match(listenerSource, /recoveredStaffNotificationSoundPriority/);
assert.doesNotMatch(
  listenerSource,
  /service_role|SUPABASE_SERVICE_ROLE_KEY|push-dispatch/,
);
assert.equal(notificationDurationMs("transient"), 4500);
assert.equal(notificationDurationMs("persistent"), null);
const transientToast = buildStaffNotificationToast(
  {
    id: "00000000-0000-4000-8000-000000000300",
    code: "new_order",
    title: "New order",
    description: "Synthetic summary",
    href: "/owner",
  },
  "transient",
);
const persistentToast = buildStaffNotificationToast(
  {
    id: "00000000-0000-4000-8000-000000000301",
    code: "new_order",
    title: "New order",
    description: "Synthetic summary",
    href: "/owner",
  },
  "persistent",
);
assert.equal(transientToast.durationMs, 4500);
assert.equal(transientToast.actionHref, undefined);
assert.equal(persistentToast.durationMs, null);
assert.equal(persistentToast.actionHref, "/owner");

const rlsMigration = readFileSync(
  resolve(
    "supabase/migrations/20260903160000_staff_notification_reliability.sql",
  ),
  "utf8",
);
assert.match(rlsMigration, /for select\s+to authenticated\s+using/i);
assert.match(rlsMigration, /staff_profiles\.auth_user_id = auth\.uid\(\)/);
assert.match(rlsMigration, /staff_profiles\.is_active = true/);
assert.match(
  rlsMigration,
  /grant select on table public\.staff_notification_events to authenticated/i,
);

const listener = await readFileSync(
  resolve("src/components/shell/StaffNotificationListener.tsx"),
  "utf8",
);
assert.match(listener, /claimStaffNotificationForStaff/);
assert.match(listener, /listenerStartedAtRef/);
console.log(
  "PASS staff notification recovery: bounded cursor, pagination, overlap, retry visibility, preferences, RLS source policy, transient/persistent semantics",
);
