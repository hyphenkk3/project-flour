"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import type { StaffNotificationPreference } from "@/foundation/staff/notification-preferences";
import {
  loadStaffNotificationRecoveryCursor,
  hasRecentStaffNotificationRecoverySkipNotice,
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
  recoveredStaffNotificationSoundPriority,
  shouldPlayStaffNotificationSound,
} from "@/foundation/staff/staff-notification-sound";
import {
  createMalformedLiveRecoveryGate,
  getLiveNotificationShape,
  normalizeLiveNotificationEvent,
  toSafeRealtimeSubscriptionStatus,
  type SafeRealtimeSubscriptionStatus,
} from "@/foundation/staff/staff-notification-live-fallback";

type StaffNotificationListenerProps = {
  staffId: string;
  notificationPreferences: StaffNotificationPreference[];
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
  | "ready";

type AutomaticFallbackDiagnostic = {
  idPresent: boolean;
  supportedCodePresent: boolean;
  realtimeSubscriptionStatus: SafeRealtimeSubscriptionStatus;
};

export function StaffNotificationListener({
  staffId,
  notificationPreferences,
}: StaffNotificationListenerProps) {
  const { toast } = useToast();
  const listenerStartedAtRef = useRef<number | null>(null);
  const [listenerState, setListenerState] =
    useState<ListenerState>("connecting");
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const retryRecoveryRef = useRef<(() => void) | null>(null);
  const recoveryInProgressRef = useRef(false);
  const recoveryRequestedRef = useRef(false);
  const recoveredSoundPriorityInBatchRef = useRef(0);
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

  const getPreference = useCallback(
    (code: StaffNotificationPreference["code"]) =>
      notificationPreferences.find((preference) => preference.code === code) ??
      null,
    [notificationPreferences],
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
    async (event: StaffNotificationEvent, recovered: boolean) => {
      const preference = getPreference(event.code);
      if (!preference) return;
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
      if (!showWeb && !playSound) return;

      const claim = await claimStaffNotificationForStaff(
        staffId,
        event.id,
        () => {
          if (showWeb) {
            toast(buildStaffNotificationToast(event, preference.webMode));
          }
          if (playSound) {
            if (recovered) {
              recoveredSoundPriorityInBatchRef.current = Math.max(
                recoveredSoundPriorityInBatchRef.current,
                recoveredSoundPriority,
              );
            } else {
              void playStaffNotificationSound();
            }
          }
        },
      );
      if (claim.presentationFailed) {
        throw new Error("Notification presentation failed");
      }
      if (!claim.claimed) return;
      if (!claim.crossTabProtected) {
        console.warn(
          "[staff-notifications] Cross-tab deduplication unavailable",
        );
      }
    },
    [getPreference, staffId, toast],
  );

  const runRecovery = useCallback(async () => {
    if (recoveryInProgressRef.current) {
      recoveryRequestedRef.current = true;
      return;
    }
    recoveryInProgressRef.current = true;
    const automaticFallbackDiagnostic = automaticFallbackDiagnosticRef.current;
    automaticFallbackDiagnosticRef.current = null;
    let automaticRecoverySucceeded = false;
    recoveredSoundPriorityInBatchRef.current = 0;
    recoverySkippedOlderEventsRef.current =
      recoverySkippedOlderEventsRef.current ||
      hasRecentStaffNotificationRecoverySkipNotice(staffId);
    try {
      const supabase = createClient();
      setListenerState("recovering");
      if (!recoverySkippedOlderEventsRef.current) setRecoveryMessage(null);

      const result = await recoverStaffNotificationEvents({
        staffId,
        cursor: loadStaffNotificationRecoveryCursor(staffId),
        startedAt: listenerStartedAtRef.current ?? Date.now(),
        fetchPage: async ({ after, since, until, limit }) => {
          let query = supabase
            .from("staff_notification_events")
            .select("id, created_at, code, order_id, title, description, href")
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

          const { data, error } = await query;
          return {
            events: data as NotificationEventRow[] | null,
            error,
          };
        },
        deliver: async (row) => {
          const event = normalizeLiveNotificationEvent(row);
          if (!event) throw new Error("Unsupported notification event row");
          await presentEvent(event, true);
        },
        saveCursor: saveStaffNotificationRecoveryCursor,
      });

      if (result.olderEventsSkipped) {
        recoverySkippedOlderEventsRef.current = true;
        markStaffNotificationRecoverySkipNotice(staffId);
      }

      if (result.status === "failed") {
        setListenerState("recovery-failed");
        setRecoveryMessage(
          recoverySkippedOlderEventsRef.current
            ? "Notifications older than the 15-minute recovery window were skipped. Some recent notifications may not have loaded; try recovery again."
            : "Some staff notifications may not have loaded. Try recovery again.",
        );
        console.error("[staff-notifications] Recovery failed; cursor retained");
        return;
      }
      if (result.status === "incomplete") {
        setListenerState("recovery-incomplete");
        setRecoveryMessage(
          recoverySkippedOlderEventsRef.current
            ? "Notifications older than the 15-minute recovery window were skipped. More recent notifications are available; continue recovery."
            : "More recent staff notifications are available. Continue recovery.",
        );
        return;
      }

      setListenerState("ready");
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
    } catch {
      setListenerState("recovery-failed");
      setRecoveryMessage(
        "Some staff notifications may not have loaded. Try recovery again.",
      );
      console.error(
        "[staff-notifications] Recovery failed before reading events",
      );
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
        void playStaffNotificationSound();
        recoveredSoundPriorityInBatchRef.current = 0;
      }
      recoveryInProgressRef.current = false;
      if (recoveryRequestedRef.current) {
        recoveryRequestedRef.current = false;
        window.setTimeout(() => retryRecoveryRef.current?.(), 0);
      }
    }
  }, [presentEvent, staffId]);

  useEffect(() => {
    retryRecoveryRef.current = () => void runRecovery();
  }, [runRecovery]);

  useEffect(() => {
    if (!anyNotificationChannelEnabled) {
      saveStaffNotificationRecoveryCursor(staffId, {
        createdAt: new Date().toISOString(),
        id: STAFF_NOTIFICATION_RECOVERY_START_ID,
      });
      return;
    }

    listenerStartedAtRef.current ??= Date.now();

    const supabase = createClient();
    let disposed = false;
    if (!loadStaffNotificationRecoveryCursor(staffId)) {
      saveStaffNotificationRecoveryCursor(staffId, {
        createdAt: new Date(listenerStartedAtRef.current - 5_000).toISOString(),
        id: STAFF_NOTIFICATION_RECOVERY_START_ID,
      });
    }
    const channel = supabase
      .channel("staff-notification-events")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "staff_notification_events",
        },
        (payload) => {
          const event = normalizeLiveNotificationEvent(payload.new);
          if (!event) {
            setListenerState("recovery-failed");
            setRecoveryMessage(
              "A staff notification could not be displayed. Try recovery again.",
            );
            const shape = getLiveNotificationShape(payload.new);
            const automaticRecoveryAttempted =
              malformedRecoveryGateRef.current?.tryStart(Date.now()) ?? false;
            if (automaticRecoveryAttempted) {
              automaticFallbackDiagnosticRef.current = {
                ...shape,
                realtimeSubscriptionStatus:
                  realtimeSubscriptionStatusRef.current,
              };
              void runRecovery();
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
          void presentEvent(event, false).catch(() => {
            console.error(
              "[staff-notifications] Live notification presentation failed; starting recovery",
            );
            void runRecovery();
          });
        },
      )
      .subscribe((status, err) => {
        if (disposed) return;
        const safeStatus = toSafeRealtimeSubscriptionStatus(status);
        realtimeSubscriptionStatusRef.current = safeStatus;
        console.info("[staff-notifications] Realtime subscription status", {
          status: safeStatus,
        });
        if (status === "SUBSCRIBED") {
          setListenerState("connected");
          void runRecovery();
          return;
        }
        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          setListenerState("disconnected");
          setRecoveryMessage("Live notifications disconnected. Reconnecting…");
          console.error("[staff-notifications] Realtime subscription failed:", {
            status: safeStatus,
            errorPresent: Boolean(err),
          });
        }
      });

    return () => {
      disposed = true;
      void supabase.removeChannel(channel);
    };
  }, [anyNotificationChannelEnabled, presentEvent, runRecovery, staffId]);

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
    case "ready":
      stateLabel = null;
      break;
  }

  if (!anyNotificationChannelEnabled) return null;
  if (!stateLabel && !recoveryMessage) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-20 left-3 z-[80] max-w-sm rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-lg"
      role="status"
    >
      <p>{recoveryMessage ?? stateLabel}</p>
      {(listenerState === "recovery-failed" ||
        listenerState === "recovery-incomplete") && (
        <button
          className="mt-1 font-semibold underline"
          onClick={() => retryRecoveryRef.current?.()}
          type="button"
        >
          Retry recovery
        </button>
      )}
    </div>
  );
}
