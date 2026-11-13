"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import type { StaffNotificationPreference } from "@/foundation/staff/notification-preferences";
import {
  loadStaffNotificationRecoveryCursor,
  hasRecentStaffNotificationRecoverySkipNotice,
  hasStaffNotificationRecoveryPending,
  clearStaffNotificationRecoveryPending,
  markStaffNotificationRecoveryPending,
  markStaffNotificationRecoverySkipNotice,
  recoverStaffNotificationEvents,
  saveStaffNotificationRecoveryCursor,
  STAFF_NOTIFICATION_RECOVERY_START_ID,
  type RecoverableStaffNotificationEvent,
} from "@/foundation/staff/staff-notification-recovery";
import {
  claimStaffNotificationForStaff,
  buildStaffNotificationToast,
  type StaffNotificationEvent,
} from "@/foundation/staff/staff-notification-engine";
import {
  playStaffNotificationSound,
  recordStaffNotificationSoundOwnership,
  recoveredStaffNotificationSoundPriority,
  shouldPlayStaffNotificationSound,
  type StaffNotificationSoundDiagnosticContext,
} from "@/foundation/staff/staff-notification-sound";
import {
  createMalformedLiveRecoveryGate,
  getLiveNotificationShape,
  normalizeLiveNotificationEvent,
  toSafeRealtimeSubscriptionStatus,
  type SafeRealtimeSubscriptionStatus,
} from "@/foundation/staff/staff-notification-live-fallback";
import {
  appendStaffNotificationRecoveryTrace,
  getPendingStaffNotificationChannelRemoval,
  isStaffNotificationRealtimeCallbackCurrent,
  isStaffNotificationTestControlOperationCurrent,
  mayUseStaffNotificationRealtimeTestControls,
  removeStaffNotificationChannelForTest,
  type RealtimeTestControlState,
  type RecoveryDiagnosticSource,
  type StaffNotificationRealtimeTestControls,
} from "@/foundation/staff/staff-notification-recovery-diagnostics";

type SupabaseBrowserClient = ReturnType<typeof createClient>;
type StaffNotificationChannel = ReturnType<SupabaseBrowserClient["channel"]>;

type StaffNotificationListenerProps = {
  staffId: string;
  notificationPreferences: StaffNotificationPreference[];
  diagnosticsEnabled?: boolean;
  isMasterOwner?: boolean;
  expectedDiagnosticsHostname?: string;
  authUserId?: string;
  onRealtimeStatusChange?: (status: SafeRealtimeSubscriptionStatus) => void;
  onTestControlStateChange?: (state: RealtimeTestControlState) => void;
  onTestControlsChange?: (
    controls: StaffNotificationRealtimeTestControls | null,
  ) => void;
};

type NotificationEventRow = RecoverableStaffNotificationEvent & {
  order_id?: string | null;
  title?: string | null;
  description?: string | null;
  href?: string | null;
};

type ListenerState =
  | "connecting"
  | "connected"
  | "disconnected"
  | "recovering"
  | "recovery-failed"
  | "recovery-incomplete"
  | "test-paused"
  | "ready";

type AutomaticFallbackDiagnostic = {
  idPresent: boolean;
  supportedCodePresent: boolean;
  realtimeSubscriptionStatus: SafeRealtimeSubscriptionStatus;
};

export function StaffNotificationListener({
  staffId,
  notificationPreferences,
  diagnosticsEnabled = false,
  isMasterOwner = false,
  expectedDiagnosticsHostname = "",
  authUserId = "",
  onRealtimeStatusChange,
  onTestControlStateChange,
  onTestControlsChange,
}: StaffNotificationListenerProps) {
  const { toast } = useToast();
  const listenerStartedAtRef = useRef<number | null>(null);
  const [listenerState, setListenerState] =
    useState<ListenerState>("connecting");
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const [recoveryPending, setRecoveryPending] = useState(false);
  const [recoveryRunning, setRecoveryRunning] = useState(false);
  const recoveryPendingRef = useRef(false);
  const retryRecoveryRef = useRef<
    ((source?: RecoveryDiagnosticSource) => void) | null
  >(null);
  const recoveryInProgressRef = useRef(false);
  const recoveryRequestedRef = useRef(false);
  const recoveredSoundPriorityInBatchRef = useRef(0);
  const recoveredSoundDiagnosticContextRef =
    useRef<StaffNotificationSoundDiagnosticContext | null>(null);
  const recoverySkippedOlderEventsRef = useRef(false);
  const realtimeSubscriptionStatusRef =
    useRef<SafeRealtimeSubscriptionStatus>("CONNECTING");
  const malformedRecoveryGateRef = useRef<ReturnType<
    typeof createMalformedLiveRecoveryGate
  > | null>(null);
  malformedRecoveryGateRef.current ??= createMalformedLiveRecoveryGate();
  const automaticFallbackDiagnosticRef =
    useRef<AutomaticFallbackDiagnostic | null>(null);
  const lastSuppressedMalformedDiagnosticAtRef = useRef(0);
  const everSubscribedRef = useRef(false);
  const recoveryRunSequenceRef = useRef(0);
  const queuedRecoverySourceRef = useRef<RecoveryDiagnosticSource | null>(null);
  const lastRetryVisibilityRef = useRef<string | null>(null);
  const diagnosticsEnabledRef = useRef(diagnosticsEnabled);
  const supabaseClientRef = useRef<SupabaseBrowserClient | null>(null);
  const realtimeChannelRef = useRef<StaffNotificationChannel | null>(null);
  const channelGenerationRef = useRef(0);
  const subscribeRealtimeRef = useRef<(() => boolean) | null>(null);
  const testPauseRequestedRef = useRef(false);
  const testPausedForStaffIdRef = useRef<string | null>(null);
  const realtimeControlOperationRef = useRef(false);
  const realtimeControlOperationGenerationRef = useRef(0);
  const listenerLifecycleGenerationRef = useRef(0);
  const resumeWaiterRef = useRef<{
    resolve: () => void;
    reject: (reason: "resume_timeout" | "control_unavailable") => void;
    timeoutId: number;
  } | null>(null);
  const listenerStaffIdRef = useRef(staffId);

  useEffect(() => {
    diagnosticsEnabledRef.current = diagnosticsEnabled;
  }, [diagnosticsEnabled]);

  const reportTestControlState = useCallback(
    (state: RealtimeTestControlState) => onTestControlStateChange?.(state),
    [onTestControlStateChange],
  );

  const trace = useCallback(
    (record: Parameters<typeof appendStaffNotificationRecoveryTrace>[0]) => {
      if (diagnosticsEnabledRef.current) {
        appendStaffNotificationRecoveryTrace(record);
      }
    },
    [],
  );

  const isTestControlAuthorized = useCallback(
    () =>
      typeof window !== "undefined" &&
      mayUseStaffNotificationRealtimeTestControls({
        diagnosticsEnabled: diagnosticsEnabledRef.current,
        isMasterOwner,
        hostname: window.location.hostname,
        expectedHostname: expectedDiagnosticsHostname,
      }),
    [expectedDiagnosticsHostname, isMasterOwner],
  );

  const verifyTestControlSession = useCallback(async () => {
    const supabase = supabaseClientRef.current;
    if (!supabase || !authUserId) return false;
    try {
      const { data, error } = await supabase.auth.getUser();
      return !error && data.user?.id === authUserId;
    } catch {
      return false;
    }
  }, [authUserId]);

  const pauseRealtimeForTest = useCallback(async () => {
    if (realtimeControlOperationRef.current) return;
    if (!isTestControlAuthorized()) {
      reportTestControlState("unavailable");
      return;
    }

    const supabase = supabaseClientRef.current;
    const channel = realtimeChannelRef.current;
    if (
      recoveryInProgressRef.current ||
      recoveryRequestedRef.current ||
      queuedRecoverySourceRef.current !== null
    ) {
      reportTestControlState("pause_failed");
      trace({
        kind: "test_listener_control",
        outcome: "failure",
        reason: "recovery_running",
        status: realtimeSubscriptionStatusRef.current,
      });
      return;
    }
    if (
      !supabase ||
      !channel ||
      realtimeSubscriptionStatusRef.current !== "SUBSCRIBED" ||
      !supabase.getChannels().includes(channel)
    ) {
      reportTestControlState("pause_failed");
      trace({
        kind: "test_listener_control",
        outcome: "failure",
        reason: "not_subscribed",
        status: realtimeSubscriptionStatusRef.current,
      });
      return;
    }

    realtimeControlOperationRef.current = true;
    const operationGeneration = ++realtimeControlOperationGenerationRef.current;
    const lifecycleGeneration = listenerLifecycleGenerationRef.current;
    reportTestControlState("pausing");
    trace({
      kind: "test_listener_control",
      outcome: "started",
      reason: "test_pause",
      status: realtimeSubscriptionStatusRef.current,
    });

    try {
      if (!(await verifyTestControlSession())) {
        if (
          !isStaffNotificationTestControlOperationCurrent({
            operationGeneration: lifecycleGeneration,
            currentGeneration: listenerLifecycleGenerationRef.current,
            operationStaffId: staffId,
            currentStaffId: listenerStaffIdRef.current,
          })
        ) {
          return;
        }
        reportTestControlState("pause_failed");
        trace({
          kind: "test_listener_control",
          outcome: "failure",
          reason: "auth_changed",
          status: realtimeSubscriptionStatusRef.current,
        });
        return;
      }

      if (
        !isStaffNotificationTestControlOperationCurrent({
          operationGeneration: lifecycleGeneration,
          currentGeneration: listenerLifecycleGenerationRef.current,
          operationStaffId: staffId,
          currentStaffId: listenerStaffIdRef.current,
        })
      ) {
        return;
      }

      // Session verification is asynchronous. A recovery can start while it is
      // pending, so recheck immediately before entering the paused state.
      if (
        recoveryInProgressRef.current ||
        recoveryRequestedRef.current ||
        queuedRecoverySourceRef.current !== null
      ) {
        reportTestControlState("pause_failed");
        trace({
          kind: "test_listener_control",
          outcome: "failure",
          reason: "recovery_running",
          status: realtimeSubscriptionStatusRef.current,
        });
        return;
      }

      testPauseRequestedRef.current = true;
      testPausedForStaffIdRef.current = staffId;
      const removalConfirmed = await removeStaffNotificationChannelForTest({
        channel,
        removeChannel: (target) => supabase.removeChannel(target),
        isRegistered: (target) => supabase.getChannels().includes(target),
        coalesceBy: supabase,
      });
      if (
        !isStaffNotificationTestControlOperationCurrent({
          operationGeneration: lifecycleGeneration,
          currentGeneration: listenerLifecycleGenerationRef.current,
          operationStaffId: staffId,
          currentStaffId: listenerStaffIdRef.current,
        })
      ) {
        return;
      }
      if (!removalConfirmed) {
        testPauseRequestedRef.current = false;
        testPausedForStaffIdRef.current = null;
        reportTestControlState("pause_failed");
        trace({
          kind: "test_listener_control",
          outcome: "failure",
          reason: "channel_removal_unconfirmed",
          status: realtimeSubscriptionStatusRef.current,
        });
        if (realtimeSubscriptionStatusRef.current === "SUBSCRIBED") {
          retryRecoveryRef.current?.("reconnect");
        }
        return;
      }

      if (realtimeChannelRef.current === channel) {
        realtimeChannelRef.current = null;
      }
      realtimeSubscriptionStatusRef.current = "CLOSED";
      onRealtimeStatusChange?.("CLOSED");
      setListenerState("test-paused");
      setRecoveryMessage(null);
      trace({
        kind: "realtime_status",
        status: "CLOSED",
        reason: "test_pause",
      });
      trace({
        kind: "test_listener_control",
        outcome: "success",
        reason: "test_pause",
        status: "CLOSED",
      });
      reportTestControlState("paused");
    } finally {
      if (
        realtimeControlOperationGenerationRef.current === operationGeneration
      ) {
        realtimeControlOperationRef.current = false;
      }
    }
  }, [
    isTestControlAuthorized,
    onRealtimeStatusChange,
    reportTestControlState,
    staffId,
    trace,
    verifyTestControlSession,
  ]);

  const resumeRealtimeForTest = useCallback(async () => {
    if (realtimeControlOperationRef.current) return;
    if (!isTestControlAuthorized()) {
      reportTestControlState("unavailable");
      return;
    }
    const lifecycleGeneration = listenerLifecycleGenerationRef.current;
    const operationGeneration = ++realtimeControlOperationGenerationRef.current;
    realtimeControlOperationRef.current = true;
    reportTestControlState("resuming");
    const supabase = supabaseClientRef.current;
    let timeoutId: number | null = null;
    try {
      if (!supabase) throw "control_unavailable";
      if (
        testPausedForStaffIdRef.current &&
        testPausedForStaffIdRef.current !== staffId
      ) {
        throw "account_changed";
      }
      if (!(await verifyTestControlSession())) throw "auth_changed";
      if (
        !isStaffNotificationTestControlOperationCurrent({
          operationGeneration: lifecycleGeneration,
          currentGeneration: listenerLifecycleGenerationRef.current,
          operationStaffId: staffId,
          currentStaffId: listenerStaffIdRef.current,
        })
      ) {
        return;
      }

      if (
        realtimeSubscriptionStatusRef.current === "SUBSCRIBED" &&
        realtimeChannelRef.current &&
        supabase.getChannels().includes(realtimeChannelRef.current)
      ) {
        testPauseRequestedRef.current = false;
        testPausedForStaffIdRef.current = null;
        setListenerState("connected");
        reportTestControlState("ready");
        return;
      }

      testPauseRequestedRef.current = false;
      testPausedForStaffIdRef.current = null;
      setListenerState("connecting");
      trace({
        kind: "test_listener_control",
        outcome: "started",
        reason: "test_resume",
        status: realtimeSubscriptionStatusRef.current,
      });

      const subscriptionReady = new Promise<void>((resolve, reject) => {
        timeoutId = window.setTimeout(() => {
          if (resumeWaiterRef.current?.timeoutId === timeoutId) {
            resumeWaiterRef.current = null;
          }
          reject("resume_timeout");
        }, 12_000);
        resumeWaiterRef.current = {
          resolve,
          reject,
          timeoutId,
        };
      });

      const subscribed = subscribeRealtimeRef.current?.() ?? false;
      if (!subscribed) {
        if (timeoutId !== null) window.clearTimeout(timeoutId);
        if (resumeWaiterRef.current?.timeoutId === timeoutId) {
          resumeWaiterRef.current = null;
        }
        throw "control_unavailable";
      }
      await subscriptionReady;
      if (
        !isStaffNotificationTestControlOperationCurrent({
          operationGeneration: lifecycleGeneration,
          currentGeneration: listenerLifecycleGenerationRef.current,
          operationStaffId: staffId,
          currentStaffId: listenerStaffIdRef.current,
        })
      ) {
        return;
      }
      trace({
        kind: "test_listener_control",
        outcome: "success",
        reason: "test_resume",
        status: "SUBSCRIBED",
      });
      reportTestControlState("ready");
    } catch (error) {
      if (
        !isStaffNotificationTestControlOperationCurrent({
          operationGeneration: lifecycleGeneration,
          currentGeneration: listenerLifecycleGenerationRef.current,
          operationStaffId: staffId,
          currentStaffId: listenerStaffIdRef.current,
        })
      ) {
        return;
      }
      const reason =
        error === "resume_timeout" ||
        error === "auth_changed" ||
        error === "account_changed"
          ? error
          : "control_unavailable";
      reportTestControlState("resume_failed");
      trace({
        kind: "test_listener_control",
        outcome: "failure",
        reason:
          reason === "resume_timeout" ||
          reason === "auth_changed" ||
          reason === "account_changed"
            ? reason
            : "test_resume_failed",
        status: realtimeSubscriptionStatusRef.current,
      });
    } finally {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (resumeWaiterRef.current?.timeoutId === timeoutId) {
        resumeWaiterRef.current = null;
      }
      if (
        realtimeControlOperationGenerationRef.current === operationGeneration
      ) {
        realtimeControlOperationRef.current = false;
      }
    }
  }, [
    isTestControlAuthorized,
    reportTestControlState,
    staffId,
    trace,
    verifyTestControlSession,
  ]);

  const realtimeTestControls = useMemo(
    () => ({ pause: pauseRealtimeForTest, resume: resumeRealtimeForTest }),
    [pauseRealtimeForTest, resumeRealtimeForTest],
  );

  const getPreference = useCallback(
    (code: StaffNotificationPreference["code"]) =>
      notificationPreferences.find((preference) => preference.code === code) ??
      null,
    [notificationPreferences],
  );

  const updateRecoveryPending = useCallback(
    (pending: boolean) => {
      recoveryPendingRef.current = pending;
      setRecoveryPending(pending);
      if (pending) {
        markStaffNotificationRecoveryPending(staffId);
      } else {
        clearStaffNotificationRecoveryPending(staffId);
      }
      const persistedPending = hasStaffNotificationRecoveryPending(staffId);
      trace({
        kind: "pending_marker",
        pending: persistedPending,
        outcome: persistedPending === pending ? "saved" : "not_saved",
      });
    },
    [staffId, trace],
  );

  const anyNotificationChannelEnabled = notificationPreferences.some(
    (preference) =>
      preference.webEnabled ||
      shouldPlayStaffNotificationSound({
        code: preference.code,
        soundEnabled: preference.soundEnabled,
      }),
  );

  const presentEvent = useCallback(
    async (
      event: StaffNotificationEvent,
      recovered: boolean,
      context: { source: RecoveryDiagnosticSource; runId?: string },
    ) => {
      const preference = getPreference(event.code);
      if (!preference) {
        trace({
          kind: "event_eligible",
          eventId: event.id,
          source: context.source,
          runId: context.runId,
          eligible: false,
          reason: "preference_missing",
        });
        trace({
          kind: "event_processing",
          eventId: event.id,
          source: context.source,
          runId: context.runId,
          outcome: "rejected",
          reason: "preference_missing",
        });
        return;
      }
      const showWeb = preference.webEnabled;
      const soundEnabled = shouldPlayStaffNotificationSound({
        code: event.code,
        soundEnabled: preference.soundEnabled,
      });
      const recoveredSoundPriority = recovered
        ? recoveredStaffNotificationSoundPriority({
            code: event.code,
            soundEnabled: preference.soundEnabled,
          })
        : 0;
      const playSound = recovered ? recoveredSoundPriority > 0 : soundEnabled;
      if (!showWeb && !playSound) {
        trace({
          kind: "event_eligible",
          eventId: event.id,
          source: context.source,
          runId: context.runId,
          eligible: false,
          reason: "category_disabled",
        });
        trace({
          kind: "event_processing",
          eventId: event.id,
          source: context.source,
          runId: context.runId,
          outcome: "rejected",
          reason: "category_disabled",
        });
        return;
      }
      trace({
        kind: "event_eligible",
        eventId: event.id,
        source: context.source,
        runId: context.runId,
        eligible: true,
        reason: "preferences_enabled",
      });

      try {
        const claim = await claimStaffNotificationForStaff(
          staffId,
          event.id,
          () => {
            if (showWeb) {
              toast({
                ...buildStaffNotificationToast(event, preference.webMode),
                notificationEventId: diagnosticsEnabledRef.current
                  ? event.id
                  : undefined,
              });
            }
            if (playSound) {
              if (recovered) {
                if (
                  recoveredSoundPriority >
                  recoveredSoundPriorityInBatchRef.current
                ) {
                  recoveredSoundPriorityInBatchRef.current =
                    recoveredSoundPriority;
                  recoveredSoundDiagnosticContextRef.current =
                    diagnosticsEnabledRef.current
                      ? {
                          eventId: event.id,
                          source: context.source,
                          soundPreferenceEnabled:
                            preference.soundEnabled === true,
                          soundEligible: true,
                        }
                      : null;
                }
              } else {
                void playStaffNotificationSound(
                  diagnosticsEnabledRef.current
                    ? {
                        eventId: event.id,
                        source: context.source,
                        soundPreferenceEnabled:
                          preference.soundEnabled === true,
                        soundEligible: true,
                      }
                    : undefined,
                );
              }
            } else if (diagnosticsEnabledRef.current) {
              recordStaffNotificationSoundOwnership({
                eventId: event.id,
                source: context.source,
                ownership: "winner",
                soundPreferenceEnabled: preference.soundEnabled === true,
                soundEligible: false,
              });
            }
          },
        );
        if (claim.presentationFailed) {
          trace({
            kind: "dedupe_claim",
            eventId: event.id,
            source: context.source,
            runId: context.runId,
            outcome: "failure",
            reason: "present_failed",
          });
          throw new Error("Notification presentation failed");
        }
        trace({
          kind: "dedupe_claim",
          eventId: event.id,
          source: context.source,
          runId: context.runId,
          outcome: claim.claimed ? "claimed" : "duplicate_suppressed",
        });
        trace({
          kind: "event_processing",
          eventId: event.id,
          source: context.source,
          runId: context.runId,
          outcome: "success",
          reason: claim.claimed ? undefined : "duplicate_suppressed",
        });
        if (!claim.claimed && diagnosticsEnabledRef.current) {
          recordStaffNotificationSoundOwnership({
            eventId: event.id,
            source: context.source,
            ownership: "duplicate_suppressed",
            soundPreferenceEnabled: preference.soundEnabled === true,
            soundEligible: soundEnabled,
          });
        }
        if (!claim.claimed) return;
        if (!claim.crossTabProtected) {
          console.warn(
            "[staff-notifications] Cross-tab deduplication unavailable",
          );
        }
      } catch (error) {
        trace({
          kind: "event_processing",
          eventId: event.id,
          source: context.source,
          runId: context.runId,
          outcome: "failure",
          reason: "present_failed",
        });
        throw error;
      }
    },
    [getPreference, staffId, toast, trace],
  );
  const presentEventRef = useRef(presentEvent);
  useEffect(() => {
    presentEventRef.current = presentEvent;
  }, [presentEvent]);

  const runRecovery = useCallback(
    async (source: RecoveryDiagnosticSource) => {
      if (testPauseRequestedRef.current) return;
      if (recoveryInProgressRef.current) {
        recoveryRequestedRef.current = true;
        queuedRecoverySourceRef.current = source;
        return;
      }
      recoveryInProgressRef.current = true;
      setRecoveryRunning(true);
      recoveryRunSequenceRef.current += 1;
      const runId =
        typeof window !== "undefined" &&
        typeof window.crypto?.randomUUID === "function"
          ? window.crypto.randomUUID()
          : `run-${Date.now()}-${recoveryRunSequenceRef.current}`;
      trace({
        kind: "recovery_started",
        runId,
        source,
        outcome: "started",
        cursorId: loadStaffNotificationRecoveryCursor(staffId)?.id,
        cursorAt: loadStaffNotificationRecoveryCursor(staffId)?.createdAt,
      });
      const automaticFallbackDiagnostic =
        automaticFallbackDiagnosticRef.current;
      automaticFallbackDiagnosticRef.current = null;
      let automaticRecoverySucceeded = false;
      recoveredSoundPriorityInBatchRef.current = 0;
      recoveredSoundDiagnosticContextRef.current = null;
      recoverySkippedOlderEventsRef.current =
        recoverySkippedOlderEventsRef.current ||
        hasRecentStaffNotificationRecoverySkipNotice(staffId);
      try {
        const supabase = createClient();
        setListenerState("recovering");
        if (!recoverySkippedOlderEventsRef.current) setRecoveryMessage(null);
        const recoveryCursor = loadStaffNotificationRecoveryCursor(staffId);
        let failureReason:
          "fetch_failed" | "present_failed" | "cursor_save_failed" | null =
          null;
        trace({
          kind: "recovery_window",
          runId,
          source,
          cursorId: recoveryCursor?.id,
          cursorAt: recoveryCursor?.createdAt,
        });

        const result = await recoverStaffNotificationEvents({
          staffId,
          cursor: recoveryCursor,
          startedAt: listenerStartedAtRef.current ?? Date.now(),
          fetchPage: async ({ after, since, until, limit }) => {
            let query = supabase
              .from("staff_notification_events")
              .select(
                "id, created_at, code, order_id, title, description, href",
              )
              .gte("created_at", since)
              .lte("created_at", until)
              .order("created_at", { ascending: true })
              .order("id", { ascending: true })
              .limit(limit);

            if (Date.parse(after.createdAt) >= Date.parse(since)) {
              query = query.or(
                `created_at.gt.${after.createdAt},and(created_at.eq.${after.createdAt},id.gt.${after.id})`,
              );
            }

            let data: NotificationEventRow[] | null;
            let error: unknown | null;
            try {
              const result = await query;
              data = result.data as NotificationEventRow[] | null;
              error = result.error;
            } catch (queryError) {
              failureReason = "fetch_failed";
              trace({
                kind: "recovery_page",
                runId,
                source,
                outcome: "failure",
                reason: "fetch_failed",
                cursorId: after.id,
                cursorAt: after.createdAt,
                limit,
              });
              throw queryError;
            }
            if (error || !data) failureReason = "fetch_failed";
            trace({
              kind: "recovery_page",
              runId,
              source,
              outcome: error || !data ? "failure" : "success",
              reason: error || !data ? "fetch_failed" : undefined,
              cursorId: after.id,
              cursorAt: after.createdAt,
              count: data?.length ?? 0,
              limit,
            });
            for (const row of data ?? []) {
              trace({
                kind: "event_eligible",
                eventId: row.id,
                runId,
                source,
                eligible: true,
                reason: "page_query",
              });
            }
            return {
              events: data,
              error,
            };
          },
          deliver: async (row) => {
            const event = normalizeLiveNotificationEvent(row);
            if (!event) {
              const shape = getLiveNotificationShape(row);
              failureReason = "present_failed";
              trace({
                kind: "normalization",
                eventId: shape.idPresent ? row.id : undefined,
                runId,
                source,
                outcome: "rejected",
                reason: !shape.idPresent
                  ? "missing_id"
                  : !shape.supportedCodePresent
                    ? "unsupported_code"
                    : "invalid_shape",
              });
              throw new Error("Unsupported notification event row");
            }
            trace({
              kind: "normalization",
              eventId: event.id,
              runId,
              source,
              outcome: "accepted",
            });
            try {
              await presentEvent(event, true, { source, runId });
            } catch (error) {
              failureReason = "present_failed";
              throw error;
            }
          },
          saveCursor: async (targetStaffId, cursor, options) => {
            let saved = false;
            try {
              saved = await saveStaffNotificationRecoveryCursor(
                targetStaffId,
                cursor,
                options,
              );
            } catch {
              saved = false;
            }
            if (!saved) failureReason = "cursor_save_failed";
            trace({
              kind: "cursor_saved",
              runId,
              source,
              eventId:
                cursor.id === STAFF_NOTIFICATION_RECOVERY_START_ID
                  ? undefined
                  : cursor.id,
              cursorId: cursor.id,
              cursorAt: cursor.createdAt,
              outcome: saved ? "saved" : "not_saved",
              reason: saved ? undefined : "cursor_save_failed",
            });
            return saved;
          },
        });

        if (result.olderEventsSkipped) {
          recoverySkippedOlderEventsRef.current = true;
          markStaffNotificationRecoverySkipNotice(staffId);
          trace({
            kind: "recovery_window",
            runId,
            source,
            reason: "expired",
          });
        }

        if (result.status === "failed") {
          updateRecoveryPending(true);
          setListenerState("recovery-failed");
          setRecoveryMessage(
            recoverySkippedOlderEventsRef.current
              ? "Notifications older than the 15-minute recovery window were skipped. Some recent notifications may not have loaded; try recovery again."
              : "Some staff notifications may not have loaded. Try recovery again.",
          );
          console.error(
            "[staff-notifications] Recovery failed; cursor retained",
          );
          trace({
            kind: "recovery_finished",
            runId,
            source,
            outcome: "failure",
            reason: failureReason ?? "unknown_failure",
            count: result.recovered,
            cursorId: result.cursor.id,
            cursorAt: result.cursor.createdAt,
          });
          return;
        }
        if (result.status === "incomplete") {
          updateRecoveryPending(true);
          setListenerState("recovery-incomplete");
          setRecoveryMessage(
            recoverySkippedOlderEventsRef.current
              ? "Notifications older than the 15-minute recovery window were skipped. More recent notifications are available; continue recovery."
              : "More recent staff notifications are available. Continue recovery.",
          );
          trace({
            kind: "recovery_finished",
            runId,
            source,
            outcome: "incomplete",
            reason: "more_due",
            count: result.recovered,
            cursorId: result.cursor.id,
            cursorAt: result.cursor.createdAt,
          });
          return;
        }

        setListenerState("ready");
        updateRecoveryPending(false);
        if (recoverySkippedOlderEventsRef.current) {
          setRecoveryMessage(
            "Notifications older than the 15-minute recovery window were skipped.",
          );
        } else if (result.futureCursorReset) {
          setRecoveryMessage(
            "The notification recovery position was ahead of current time; recent events were rechecked.",
          );
        }
        automaticRecoverySucceeded = true;
        trace({
          kind: "recovery_finished",
          runId,
          source,
          outcome: "success",
          reason: result.olderEventsSkipped ? "expired" : "complete",
          count: result.recovered,
          cursorId: result.cursor.id,
          cursorAt: result.cursor.createdAt,
        });
      } catch {
        updateRecoveryPending(true);
        setListenerState("recovery-failed");
        setRecoveryMessage(
          "Some staff notifications may not have loaded. Try recovery again.",
        );
        console.error(
          "[staff-notifications] Recovery failed before reading events",
        );
        trace({
          kind: "recovery_finished",
          runId,
          source,
          outcome: "failure",
          reason: "unknown_failure",
        });
      } finally {
        if (automaticFallbackDiagnostic) {
          const log = automaticRecoverySucceeded ? console.info : console.warn;
          log("[staff-notifications] Malformed live event fallback", {
            ...automaticFallbackDiagnostic,
            automaticRecoveryAttempted: true,
            automaticRecoverySucceeded,
          });
          malformedRecoveryGateRef.current?.finish();
        }
        if (recoveredSoundPriorityInBatchRef.current > 0) {
          void playStaffNotificationSound(
            recoveredSoundDiagnosticContextRef.current ?? undefined,
          );
          recoveredSoundPriorityInBatchRef.current = 0;
          recoveredSoundDiagnosticContextRef.current = null;
        }
        recoveryInProgressRef.current = false;
        setRecoveryRunning(false);
        if (recoveryRequestedRef.current) {
          recoveryRequestedRef.current = false;
          const queuedSource =
            queuedRecoverySourceRef.current ?? "automatic_continue";
          queuedRecoverySourceRef.current = null;
          window.setTimeout(() => retryRecoveryRef.current?.(queuedSource), 0);
        }
      }
    },
    [presentEvent, staffId, trace, updateRecoveryPending],
  );
  const runRecoveryRef = useRef(runRecovery);
  useEffect(() => {
    runRecoveryRef.current = runRecovery;
  }, [runRecovery]);

  useEffect(() => {
    retryRecoveryRef.current = (source = "manual_retry") =>
      testPauseRequestedRef.current ? undefined : void runRecovery(source);
  }, [runRecovery]);

  const isTestControlUiEnabled =
    typeof window !== "undefined" &&
    mayUseStaffNotificationRealtimeTestControls({
      diagnosticsEnabled,
      isMasterOwner,
      hostname: window.location.hostname,
      expectedHostname: expectedDiagnosticsHostname,
    });

  useEffect(() => {
    if (!isTestControlUiEnabled) {
      onTestControlsChange?.(null);
      reportTestControlState("unavailable");
      return;
    }
    onTestControlsChange?.(realtimeTestControls);
    return () => onTestControlsChange?.(null);
  }, [
    isTestControlUiEnabled,
    onTestControlsChange,
    realtimeTestControls,
    reportTestControlState,
  ]);

  useEffect(() => {
    if (listenerStaffIdRef.current !== staffId) {
      listenerLifecycleGenerationRef.current += 1;
      listenerStaffIdRef.current = staffId;
      testPauseRequestedRef.current = false;
      testPausedForStaffIdRef.current = null;
      reportTestControlState("starting");
    }

    if (!anyNotificationChannelEnabled) {
      testPauseRequestedRef.current = false;
      testPausedForStaffIdRef.current = null;
      saveStaffNotificationRecoveryCursor(staffId, {
        createdAt: new Date().toISOString(),
        id: STAFF_NOTIFICATION_RECOVERY_START_ID,
      });
      reportTestControlState("unavailable");
      return;
    }

    listenerStartedAtRef.current ??= Date.now();
    const persistedRecoveryPending =
      hasStaffNotificationRecoveryPending(staffId);
    recoveryPendingRef.current = persistedRecoveryPending;
    trace({
      kind: "pending_marker",
      pending: persistedRecoveryPending,
      outcome: "success",
    });

    const supabase = createClient();
    supabaseClientRef.current = supabase;
    let disposed = false;
    let restoredPendingState = false;
    if (!loadStaffNotificationRecoveryCursor(staffId)) {
      const initialCursor = {
        createdAt: new Date(listenerStartedAtRef.current - 5_000).toISOString(),
        id: STAFF_NOTIFICATION_RECOVERY_START_ID,
      };
      const saved = saveStaffNotificationRecoveryCursor(staffId, initialCursor);
      trace({
        kind: "cursor_saved",
        source: "page_load",
        cursorId: initialCursor.id,
        cursorAt: initialCursor.createdAt,
        outcome: saved ? "saved" : "not_saved",
        reason: saved ? undefined : "cursor_save_failed",
      });
    }

    const subscribeToStaffNotificationEvents = (): boolean => {
      if (disposed || testPauseRequestedRef.current) return false;
      const existing = realtimeChannelRef.current;
      if (existing && supabase.getChannels().includes(existing)) return true;

      // A preceding effect cleanup may still be awaiting removeChannel. Do not
      // create a replacement topic until that exact channel is confirmed gone.
      let waitingForRemoval = false;
      const deferSubscriptionUntilRemoval = (
        removal: Promise<boolean>,
      ): boolean => {
        if (waitingForRemoval) return true;
        waitingForRemoval = true;
        setListenerState("connecting");
        void removal.then((confirmed) => {
          if (disposed || testPauseRequestedRef.current) return;
          if (!confirmed) {
            realtimeSubscriptionStatusRef.current = "CHANNEL_ERROR";
            onRealtimeStatusChange?.("CHANNEL_ERROR");
            setListenerState("disconnected");
            setRecoveryMessage(
              "The notification connection could not be restored. Resume listening to try again.",
            );
            reportTestControlState("resume_failed");
            trace({
              kind: "realtime_status",
              status: "CHANNEL_ERROR",
              reason: "channel_removal_unconfirmed",
            });
            return;
          }
          if (subscribeRealtimeRef.current) {
            subscribeRealtimeRef.current();
          }
        });
        return true;
      };

      const pendingRemoval =
        getPendingStaffNotificationChannelRemoval(supabase);
      if (pendingRemoval) return deferSubscriptionUntilRemoval(pendingRemoval);

      const staleChannel = supabase
        .getChannels()
        .find(
          (candidate) =>
            candidate.topic === "realtime:staff-notification-events",
        );
      if (staleChannel) {
        return deferSubscriptionUntilRemoval(
          removeStaffNotificationChannelForTest({
            channel: staleChannel,
            removeChannel: (target) => supabase.removeChannel(target),
            isRegistered: (target) => supabase.getChannels().includes(target),
            coalesceBy: supabase,
          }),
        );
      }

      const generation = ++channelGenerationRef.current;
      const channel = supabase.channel("staff-notification-events").on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "staff_notification_events",
        },
        (payload) => {
          if (
            !isStaffNotificationRealtimeCallbackCurrent({
              disposed,
              intentionallyPaused: testPauseRequestedRef.current,
              channelGeneration: generation,
              currentGeneration: channelGenerationRef.current,
              isCurrentChannel: realtimeChannelRef.current === channel,
            })
          ) {
            return;
          }
          const event = normalizeLiveNotificationEvent(payload.new);
          if (!event) {
            setListenerState("recovery-failed");
            setRecoveryMessage(
              "A staff notification could not be displayed. Try recovery again.",
            );
            const automaticRecoveryAttempted =
              malformedRecoveryGateRef.current?.tryStart(Date.now()) ?? false;
            const shape = getLiveNotificationShape(payload.new);
            trace({
              kind: "normalization",
              eventId: shape.idPresent
                ? (payload.new as { id: string }).id
                : undefined,
              source: "live",
              outcome: "rejected",
              reason: !shape.idPresent
                ? "missing_id"
                : !shape.supportedCodePresent
                  ? "unsupported_code"
                  : "invalid_shape",
            });
            if (automaticRecoveryAttempted) {
              automaticFallbackDiagnosticRef.current = {
                ...shape,
                realtimeSubscriptionStatus:
                  realtimeSubscriptionStatusRef.current,
              };
              runRecoveryRef.current("live_fallback");
            } else if (
              Date.now() - lastSuppressedMalformedDiagnosticAtRef.current >=
              30_000
            ) {
              lastSuppressedMalformedDiagnosticAtRef.current = Date.now();
              console.warn(
                "[staff-notifications] Malformed live event fallback",
                {
                  ...shape,
                  realtimeSubscriptionStatus:
                    realtimeSubscriptionStatusRef.current,
                  automaticRecoveryAttempted: false,
                  automaticRecoverySucceeded: false,
                },
              );
            }
            return;
          }
          trace({
            kind: "normalization",
            eventId: event.id,
            source: "live",
            outcome: "accepted",
          });
          void presentEventRef
            .current(event, false, { source: "live" })
            .catch(() => {
              console.error(
                "[staff-notifications] Live notification presentation failed; starting recovery",
              );
              runRecoveryRef.current("live_presentation_failure");
            });
        },
      );
      realtimeChannelRef.current = channel;
      channel.subscribe((status, err) => {
        if (
          disposed ||
          generation !== channelGenerationRef.current ||
          realtimeChannelRef.current !== channel
        ) {
          return;
        }
        if (!restoredPendingState) {
          restoredPendingState = true;
          setRecoveryPending(persistedRecoveryPending);
        }
        const safeStatus = toSafeRealtimeSubscriptionStatus(status);
        realtimeSubscriptionStatusRef.current = safeStatus;
        onRealtimeStatusChange?.(safeStatus);
        trace({
          kind: "realtime_status",
          status: safeStatus,
          reason: testPauseRequestedRef.current ? "test_pause" : undefined,
        });
        console.info("[staff-notifications] Realtime subscription status", {
          status: safeStatus,
        });

        if (testPauseRequestedRef.current) return;

        if (status === "SUBSCRIBED") {
          setListenerState("connected");
          reportTestControlState("ready");
          const waiter = resumeWaiterRef.current;
          if (waiter) {
            window.clearTimeout(waiter.timeoutId);
            resumeWaiterRef.current = null;
            waiter.resolve();
          }
          const source = everSubscribedRef.current ? "reconnect" : "page_load";
          everSubscribedRef.current = true;
          runRecoveryRef.current(source);
          return;
        }
        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          const waiter = resumeWaiterRef.current;
          if (waiter) {
            window.clearTimeout(waiter.timeoutId);
            resumeWaiterRef.current = null;
            waiter.reject("control_unavailable");
          }
          setListenerState("disconnected");
          setRecoveryMessage(
            recoveryPendingRef.current
              ? recoverySkippedOlderEventsRef.current
                ? "Notifications older than the 15-minute recovery window were skipped. Remaining notifications may still need recovery; retry when the connection is available."
                : "Live notifications are reconnecting. Notification recovery is still pending; retry when the connection is available."
              : "Live notifications disconnected. Reconnecting…",
          );
          console.error("[staff-notifications] Realtime subscription failed:", {
            status: safeStatus,
            errorPresent: Boolean(err),
          });
        }
      });
      return true;
    };

    subscribeRealtimeRef.current = subscribeToStaffNotificationEvents;
    if (
      testPauseRequestedRef.current &&
      testPausedForStaffIdRef.current === staffId
    ) {
      realtimeSubscriptionStatusRef.current = "CLOSED";
      onRealtimeStatusChange?.("CLOSED");
      setListenerState("test-paused");
      reportTestControlState("paused");
    } else {
      subscribeToStaffNotificationEvents();
    }

    return () => {
      disposed = true;
      listenerLifecycleGenerationRef.current += 1;
      realtimeControlOperationGenerationRef.current += 1;
      realtimeControlOperationRef.current = false;
      testPauseRequestedRef.current = false;
      testPausedForStaffIdRef.current = null;
      if (subscribeRealtimeRef.current === subscribeToStaffNotificationEvents) {
        subscribeRealtimeRef.current = null;
      }
      const channel = realtimeChannelRef.current;
      if (channel && supabase.getChannels().includes(channel)) {
        realtimeChannelRef.current = null;
        void removeStaffNotificationChannelForTest({
          channel,
          removeChannel: (target) => supabase.removeChannel(target),
          isRegistered: (target) => supabase.getChannels().includes(target),
          coalesceBy: supabase,
        });
      }
      if (resumeWaiterRef.current) {
        window.clearTimeout(resumeWaiterRef.current.timeoutId);
        resumeWaiterRef.current.reject("control_unavailable");
        resumeWaiterRef.current = null;
      }
      if (supabaseClientRef.current === supabase) {
        supabaseClientRef.current = null;
      }
    };
  }, [
    anyNotificationChannelEnabled,
    authUserId,
    onRealtimeStatusChange,
    reportTestControlState,
    staffId,
    trace,
  ]);

  let stateLabel: string | null;
  switch (listenerState) {
    case "connecting":
      stateLabel = "Connecting to live staff notifications…";
      break;
    case "connected":
    case "recovering":
      stateLabel = "Restoring recent staff notifications…";
      break;
    case "disconnected":
      stateLabel = "Live staff notifications are reconnecting.";
      break;
    case "recovery-failed":
      stateLabel = "Recent staff notifications could not be restored.";
      break;
    case "recovery-incomplete":
      stateLabel = "Recent staff notifications need another recovery pass.";
      break;
    case "test-paused":
      stateLabel = "Realtime paused for a DEV recovery test.";
      break;
    case "ready":
      stateLabel = null;
      break;
  }

  const retryVisible =
    (recoveryPending ||
      listenerState === "recovery-failed" ||
      listenerState === "recovery-incomplete") &&
    listenerState !== "test-paused" &&
    listenerState !== "recovering" &&
    !recoveryRunning;
  const retryVisibilityReason = !retryVisible
    ? recoveryRunning || listenerState === "recovering"
      ? "recovering"
      : undefined
    : listenerState === "recovery-incomplete"
      ? "recovery_incomplete"
      : listenerState === "recovery-failed"
        ? "recovery_failed"
        : listenerState === "disconnected"
          ? "disconnected"
          : "pending_backlog";
  const retryVisibilityKey = `${retryVisible}:${retryVisibilityReason ?? "none"}`;

  useEffect(() => {
    if (
      !diagnosticsEnabled ||
      lastRetryVisibilityRef.current === retryVisibilityKey
    ) {
      return;
    }
    lastRetryVisibilityRef.current = retryVisibilityKey;
    trace({
      kind: "retry_visibility",
      visible: retryVisible,
      outcome: retryVisible ? "visible" : "hidden",
      reason: retryVisibilityReason,
    });
  }, [
    diagnosticsEnabled,
    retryVisibilityKey,
    retryVisibilityReason,
    retryVisible,
    trace,
  ]);

  if (!anyNotificationChannelEnabled) return null;
  if (!stateLabel && !recoveryMessage) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-20 left-3 z-[80] max-w-sm rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-lg"
      role="status"
    >
      <p>{recoveryMessage ?? stateLabel}</p>
      {retryVisible && (
        <button
          className="mt-1 font-semibold underline"
          onClick={() => retryRecoveryRef.current?.("manual_retry")}
          type="button"
        >
          Retry recovery
        </button>
      )}
    </div>
  );
}
