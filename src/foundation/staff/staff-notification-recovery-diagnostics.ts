export const STAFF_NOTIFICATION_RECOVERY_TRACE_KEY =
  "wos-staff-notification-recovery-trace-v1";
export const STAFF_NOTIFICATION_RECOVERY_TRACE_LIMIT = 200;
export const STAFF_NOTIFICATION_RECOVERY_TRACE_TTL_MS = 60 * 60 * 1000;

export type RecoveryDiagnosticSource =
  | "page_load"
  | "reconnect"
  | "manual_retry"
  | "live_fallback"
  | "live_presentation_failure"
  | "automatic_continue"
  | "live";

export type RecoveryDiagnosticKind =
  | "realtime_status"
  | "recovery_started"
  | "recovery_window"
  | "recovery_page"
  | "event_eligible"
  | "normalization"
  | "dedupe_claim"
  | "event_processing"
  | "toast_queued"
  | "toast_retained"
  | "toast_mounted"
  | "toast_evicted"
  | "toast_dismissed"
  | "toast_expired"
  | "cursor_saved"
  | "pending_marker"
  | "retry_visibility"
  | "test_listener_control"
  | "recovery_finished";

export type RealtimeTestControlState =
  | "starting"
  | "ready"
  | "pausing"
  | "paused"
  | "resuming"
  | "pause_failed"
  | "resume_failed"
  | "unavailable";

export type StaffNotificationRealtimeTestControls = {
  pause: () => Promise<void>;
  resume: () => Promise<void>;
};

const pendingStaffNotificationChannelRemovals = new WeakMap<
  object,
  Promise<boolean>
>();

export type RecoveryDiagnosticRecord = {
  at: number;
  kind: RecoveryDiagnosticKind;
  runId?: string;
  eventId?: string;
  source?: RecoveryDiagnosticSource;
  outcome?:
    | "started"
    | "success"
    | "failure"
    | "incomplete"
    | "accepted"
    | "rejected"
    | "claimed"
    | "duplicate_suppressed"
    | "retained"
    | "mounted"
    | "evicted"
    | "dismissed"
    | "expired"
    | "saved"
    | "not_saved"
    | "visible"
    | "hidden";
  reason?:
    | "complete"
    | "more_due"
    | "fetch_failed"
    | "present_failed"
    | "cursor_save_failed"
    | "expired"
    | "missing_id"
    | "unsupported_code"
    | "invalid_shape"
    | "duplicate_suppressed"
    | "page_query"
    | "preferences_enabled"
    | "category_disabled"
    | "preference_missing"
    | "toast_limit"
    | "transient_timeout"
    | "user_dismissed"
    | "disconnected"
    | "recovering"
    | "pending_backlog"
    | "recovery_failed"
    | "recovery_incomplete"
    | "unknown_failure"
    | "test_pause"
    | "test_resume"
    | "test_pause_failed"
    | "test_resume_failed"
    | "auth_changed"
    | "not_subscribed"
    | "channel_removal_unconfirmed"
    | "resume_timeout"
    | "recovery_running"
    | "control_unavailable"
    | "account_changed";
  status?:
    | "CONNECTING"
    | "SUBSCRIBED"
    | "CHANNEL_ERROR"
    | "TIMED_OUT"
    | "CLOSED"
    | "UNKNOWN";
  cursorId?: string;
  cursorAt?: string;
  count?: number;
  limit?: number;
  eligible?: boolean;
  pending?: boolean;
  visible?: boolean;
};

export type RecoveryDiagnosticsScope = {
  vercelEnvironment: string | undefined;
  vercelProjectId: string | undefined;
  vercelBranch: string | undefined;
  vercelUrl: string | undefined;
  supabaseUrl: string | undefined;
  isMasterOwner: boolean;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIAGNOSTIC_KINDS: readonly string[] = [
  "realtime_status",
  "recovery_started",
  "recovery_window",
  "recovery_page",
  "event_eligible",
  "normalization",
  "dedupe_claim",
  "event_processing",
  "toast_queued",
  "toast_retained",
  "toast_mounted",
  "toast_evicted",
  "toast_dismissed",
  "toast_expired",
  "cursor_saved",
  "pending_marker",
  "retry_visibility",
  "test_listener_control",
  "recovery_finished",
];
const DIAGNOSTIC_SOURCES: readonly string[] = [
  "page_load",
  "reconnect",
  "manual_retry",
  "live_fallback",
  "live_presentation_failure",
  "automatic_continue",
  "live",
];
const DIAGNOSTIC_OUTCOMES: readonly string[] = [
  "started",
  "success",
  "failure",
  "incomplete",
  "accepted",
  "rejected",
  "claimed",
  "duplicate_suppressed",
  "retained",
  "mounted",
  "evicted",
  "dismissed",
  "expired",
  "saved",
  "not_saved",
  "visible",
  "hidden",
];
const DIAGNOSTIC_REASONS: readonly string[] = [
  "complete",
  "more_due",
  "fetch_failed",
  "present_failed",
  "cursor_save_failed",
  "expired",
  "missing_id",
  "unsupported_code",
  "invalid_shape",
  "duplicate_suppressed",
  "page_query",
  "preferences_enabled",
  "category_disabled",
  "preference_missing",
  "toast_limit",
  "transient_timeout",
  "user_dismissed",
  "disconnected",
  "recovering",
  "pending_backlog",
  "recovery_failed",
  "recovery_incomplete",
  "unknown_failure",
  "test_pause",
  "test_resume",
  "test_pause_failed",
  "test_resume_failed",
  "auth_changed",
  "not_subscribed",
  "channel_removal_unconfirmed",
  "resume_timeout",
  "recovery_running",
  "control_unavailable",
  "account_changed",
];
const DIAGNOSTIC_STATUSES: readonly string[] = [
  "CONNECTING",
  "SUBSCRIBED",
  "CHANNEL_ERROR",
  "TIMED_OUT",
  "CLOSED",
  "UNKNOWN",
];
let pendingRecords: RecoveryDiagnosticRecord[] = [];
let flushScheduled = false;

export function isRecoveryDiagnosticsEnabled(
  scope: RecoveryDiagnosticsScope,
): boolean {
  const deploymentHost = scope.vercelUrl?.toLowerCase();
  return (
    scope.isMasterOwner &&
    scope.vercelEnvironment === "preview" &&
    scope.vercelProjectId === "prj_3rmlAQzLSFOi15DEGczSuDYDq8xr" &&
    scope.vercelBranch === "codex/staff-notifications-dev-20261109" &&
    scope.supabaseUrl?.replace(/\/$/, "") ===
      "https://tzwtpxdcggesgjaqxkqr.supabase.co" &&
    Boolean(deploymentHost) &&
    /^[a-z0-9-]+\.vercel\.app$/.test(deploymentHost ?? "")
  );
}

export function isStaffNotificationChannelRemovalConfirmed(
  response: unknown,
  channelStillRegistered: boolean,
): boolean {
  return response === "ok" && !channelStillRegistered;
}

export function mayUseStaffNotificationRealtimeTestControls(input: {
  diagnosticsEnabled: boolean;
  isMasterOwner: boolean;
  hostname: string | undefined;
  expectedHostname: string;
}): boolean {
  return (
    input.diagnosticsEnabled &&
    input.isMasterOwner &&
    Boolean(input.hostname) &&
    input.hostname === input.expectedHostname &&
    /^[a-z0-9-]+\.vercel\.app$/.test(input.hostname ?? "")
  );
}

export function isStaffNotificationRealtimeCallbackCurrent(input: {
  disposed: boolean;
  intentionallyPaused: boolean;
  channelGeneration: number;
  currentGeneration: number;
  isCurrentChannel: boolean;
}): boolean {
  return (
    !input.disposed &&
    !input.intentionallyPaused &&
    input.channelGeneration === input.currentGeneration &&
    input.isCurrentChannel
  );
}

export function isStaffNotificationTestControlOperationCurrent(input: {
  operationGeneration: number;
  currentGeneration: number;
  operationStaffId: string;
  currentStaffId: string;
}): boolean {
  return (
    input.operationGeneration === input.currentGeneration &&
    input.operationStaffId === input.currentStaffId
  );
}

export async function removeStaffNotificationChannelForTest<TChannel>(input: {
  channel: TChannel;
  removeChannel: (channel: TChannel) => Promise<unknown>;
  isRegistered: (channel: TChannel) => boolean;
  coalesceBy?: object;
}): Promise<boolean> {
  const existing = input.coalesceBy
    ? pendingStaffNotificationChannelRemovals.get(input.coalesceBy)
    : undefined;
  if (existing) return existing;

  const removal = (async () => {
    let response: unknown;
    try {
      response = await input.removeChannel(input.channel);
      return isStaffNotificationChannelRemovalConfirmed(
        response,
        input.isRegistered(input.channel),
      );
    } catch {
      return false;
    }
  })();

  if (input.coalesceBy) {
    pendingStaffNotificationChannelRemovals.set(input.coalesceBy, removal);
    void removal.then(
      () => {
        if (
          pendingStaffNotificationChannelRemovals.get(input.coalesceBy!) ===
          removal
        ) {
          pendingStaffNotificationChannelRemovals.delete(input.coalesceBy!);
        }
      },
      () => {
        if (
          pendingStaffNotificationChannelRemovals.get(input.coalesceBy!) ===
          removal
        ) {
          pendingStaffNotificationChannelRemovals.delete(input.coalesceBy!);
        }
      },
    );
  }
  return removal;
}

export function getPendingStaffNotificationChannelRemoval(
  client: object,
): Promise<boolean> | undefined {
  return pendingStaffNotificationChannelRemovals.get(client);
}

export function pruneRecoveryDiagnosticRecords(
  records: RecoveryDiagnosticRecord[],
  now = Date.now(),
): RecoveryDiagnosticRecord[] {
  return records
    .filter(
      (record) =>
        Number.isFinite(record.at) &&
        record.at <= now &&
        now - record.at <= STAFF_NOTIFICATION_RECOVERY_TRACE_TTL_MS,
    )
    .slice(-STAFF_NOTIFICATION_RECOVERY_TRACE_LIMIT);
}

function sanitizeRecord(
  input: Omit<RecoveryDiagnosticRecord, "at"> & { at?: number },
  now = Date.now(),
): RecoveryDiagnosticRecord {
  const safe: RecoveryDiagnosticRecord = {
    at: input.at ?? now,
    kind: input.kind,
  };
  if (input.runId && UUID_PATTERN.test(input.runId)) safe.runId = input.runId;
  if (input.eventId && UUID_PATTERN.test(input.eventId))
    safe.eventId = input.eventId;
  if (input.source && DIAGNOSTIC_SOURCES.includes(input.source)) {
    safe.source = input.source;
  }
  if (input.outcome && DIAGNOSTIC_OUTCOMES.includes(input.outcome)) {
    safe.outcome = input.outcome;
  }
  if (input.reason && DIAGNOSTIC_REASONS.includes(input.reason)) {
    safe.reason = input.reason;
  }
  if (input.status && DIAGNOSTIC_STATUSES.includes(input.status)) {
    safe.status = input.status;
  }
  if (input.cursorId && UUID_PATTERN.test(input.cursorId))
    safe.cursorId = input.cursorId;
  if (input.cursorAt && Number.isFinite(Date.parse(input.cursorAt))) {
    safe.cursorAt = input.cursorAt;
  }
  if (typeof input.count === "number" && Number.isFinite(input.count)) {
    safe.count = Math.max(0, Math.floor(input.count));
  }
  if (typeof input.limit === "number" && Number.isFinite(input.limit)) {
    safe.limit = Math.max(0, Math.floor(input.limit));
  }
  if (typeof input.eligible === "boolean") safe.eligible = input.eligible;
  if (typeof input.pending === "boolean") safe.pending = input.pending;
  if (typeof input.visible === "boolean") safe.visible = input.visible;
  return safe;
}

export function readStaffNotificationRecoveryTrace(): RecoveryDiagnosticRecord[] {
  if (typeof window === "undefined") return [];
  return pruneRecoveryDiagnosticRecords([
    ...readStoredRecoveryTrace(),
    ...pendingRecords,
  ]);
}

function readStoredRecoveryTrace(): RecoveryDiagnosticRecord[] {
  try {
    const raw = window.sessionStorage.getItem(
      STAFF_NOTIFICATION_RECOVERY_TRACE_KEY,
    );
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const sanitized = parsed.flatMap((record): RecoveryDiagnosticRecord[] => {
      if (
        !record ||
        typeof record !== "object" ||
        typeof record.at !== "number" ||
        typeof record.kind !== "string" ||
        !DIAGNOSTIC_KINDS.includes(record.kind)
      ) {
        return [];
      }
      return [
        sanitizeRecord(
          record as Omit<RecoveryDiagnosticRecord, "at"> & { at: number },
        ),
      ];
    });
    return pruneRecoveryDiagnosticRecords(sanitized);
  } catch {
    return [];
  }
}

export function appendStaffNotificationRecoveryTrace(
  input: Omit<RecoveryDiagnosticRecord, "at"> & { at?: number },
): void {
  if (typeof window === "undefined") return;
  try {
    pendingRecords = pruneRecoveryDiagnosticRecords([
      ...pendingRecords,
      sanitizeRecord(input),
    ]);
    window.dispatchEvent(
      new Event("staff-notification-recovery-trace-updated"),
    );
    if (!flushScheduled) {
      flushScheduled = true;
      window.setTimeout(() => {
        flushScheduled = false;
        if (typeof window === "undefined") return;
        try {
          const records = pruneRecoveryDiagnosticRecords([
            ...readStoredRecoveryTrace(),
            ...pendingRecords,
          ]);
          if (records.length === 0) {
            window.sessionStorage.removeItem(
              STAFF_NOTIFICATION_RECOVERY_TRACE_KEY,
            );
          } else {
            window.sessionStorage.setItem(
              STAFF_NOTIFICATION_RECOVERY_TRACE_KEY,
              JSON.stringify(records),
            );
          }
          pendingRecords = [];
          window.dispatchEvent(
            new Event("staff-notification-recovery-trace-updated"),
          );
        } catch {
          // Diagnostics are best-effort and never affect notification delivery.
        }
      }, 0);
    }
  } catch {
    // Diagnostics are best-effort and never affect notification delivery.
  }
}

export function clearStaffNotificationRecoveryTrace(): void {
  if (typeof window === "undefined") return;
  try {
    pendingRecords = [];
    window.sessionStorage.removeItem(STAFF_NOTIFICATION_RECOVERY_TRACE_KEY);
    window.dispatchEvent(
      new Event("staff-notification-recovery-trace-updated"),
    );
  } catch {
    // Clearing diagnostics must remain safe when storage is unavailable.
  }
}
