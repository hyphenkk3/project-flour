"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import type { StaffNotificationPreference } from "@/foundation/staff/notification-preferences";
import {
  buildStaffNotificationToast,
  claimStaffNotificationForStaff,
  type StaffNotificationEvent,
} from "@/foundation/staff/staff-notification-engine";
import {
  clearStaffNotificationRecoveryPending,
  hasStaffNotificationRecoveryPending,
  loadStaffNotificationRecoveryCursor,
  markStaffNotificationRecoveryPending,
  recoverStaffNotificationEvents,
  saveStaffNotificationRecoveryCursor,
  type RecoverableStaffNotificationEvent,
} from "@/foundation/staff/staff-notification-recovery";
import { normalizeLiveNotificationEvent } from "@/foundation/staff/staff-notification-live-fallback";
import {
  playStaffNotificationSound,
  recordStaffNotificationSoundOwnership,
} from "@/foundation/staff/staff-notification-sound";

type NotificationRow = RecoverableStaffNotificationEvent & {
  order_id?: string | null;
  title?: string | null;
  description?: string | null;
  href?: string | null;
};

type Props = {
  staffId: string;
  notificationPreferences: StaffNotificationPreference[];
};

type RecoveredSoundCandidate = { eventId: string; priority: number };

function takeRecoveredSoundCandidate(reference: {
  current: RecoveredSoundCandidate | null;
}): RecoveredSoundCandidate | null {
  const candidate = reference.current;
  reference.current = null;
  return candidate;
}

export function StaffNotificationListener({
  staffId,
  notificationPreferences,
}: Props) {
  const { toast } = useToast();
  const [retryVisible, setRetryVisible] = useState(() =>
    hasStaffNotificationRecoveryPending(staffId),
  );
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const [recoveryRunning, setRecoveryRunning] = useState(false);
  const runRecoveryRef = useRef<
    | ((source: "page_load" | "reconnect" | "manual_retry") => Promise<void>)
    | null
  >(null);
  const recoveryInFlightRef = useRef(false);
  const recoveryAgainRef = useRef(false);
  const malformedRecoveryAtRef = useRef(0);
  const recoveredSoundRef = useRef<{
    eventId: string;
    priority: number;
  } | null>(null);
  const mountedStaffIdRef = useRef(staffId);
  const startedAtRef = useRef<number | null>(null);

  const preferenceFor = useCallback(
    (code: StaffNotificationPreference["code"]) =>
      notificationPreferences.find((item) => item.code === code) ?? null,
    [notificationPreferences],
  );

  const present = useCallback(
    async (
      event: StaffNotificationEvent,
      source: "live" | "reconnect",
      recovered = false,
    ) => {
      const preference = preferenceFor(event.code);
      if (!preference) return;
      const webEligible = preference.webEnabled;
      const soundEligible = preference.soundEnabled === true;
      if (!webEligible && !soundEligible) return;

      const claim = await claimStaffNotificationForStaff(
        staffId,
        event.id,
        () => {
          if (webEligible) {
            toast(buildStaffNotificationToast(event, preference.webMode));
          }
          if (soundEligible && !recovered) {
            void playStaffNotificationSound({
              eventId: event.id,
              ownership: "winner",
              soundEnabled: true,
              eligible: true,
            });
          } else if (!soundEligible) {
            recordStaffNotificationSoundOwnership({
              eventId: event.id,
              ownership: "winner",
              soundEnabled: false,
              eligible: webEligible,
            });
          }
        },
      );

      if (claim.presentationFailed) {
        throw new Error("Notification presentation failed");
      }
      if (claim.claimed) {
        console.info("[staff-notifications] presentation", {
          eventId: event.id,
          source,
          ownership: "winner",
          soundEnabled: soundEligible,
          soundAttempted: soundEligible && !recovered,
          recovered,
        });
        if (soundEligible && recovered) {
          const priority = [
            "order_cancelled",
            "approval_required",
            "last_minute",
            "fresh_pick_walk_in_hold_reminder",
          ].includes(event.code)
            ? 2
            : 1;
          if (
            !recoveredSoundRef.current ||
            priority > recoveredSoundRef.current.priority
          ) {
            recoveredSoundRef.current = { eventId: event.id, priority };
          }
        }
      } else {
        recordStaffNotificationSoundOwnership({
          eventId: event.id,
          ownership: "duplicate_suppressed",
          soundEnabled: soundEligible,
          eligible: webEligible || soundEligible,
        });
        console.info("[staff-notifications] presentation", {
          eventId: event.id,
          source,
          ownership: "duplicate_suppressed",
          soundEnabled: soundEligible,
          soundAttempted: false,
          recovered,
        });
      }
    },
    [preferenceFor, staffId, toast],
  );

  const runRecovery = useCallback(
    async (source: "page_load" | "reconnect" | "manual_retry") => {
      if (recoveryInFlightRef.current) {
        recoveryAgainRef.current = true;
        return;
      }
      recoveryInFlightRef.current = true;
      setRecoveryRunning(true);
      recoveredSoundRef.current = null;
      console.info("[staff-notifications] recovery started", { source });
      try {
        const supabase = createClient();
        const result = await recoverStaffNotificationEvents({
          staffId,
          cursor: loadStaffNotificationRecoveryCursor(staffId),
          startedAt: startedAtRef.current ?? Date.now(),
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
            const { data, error } = await query;
            return { events: data as NotificationRow[] | null, error };
          },
          deliver: async (row) => {
            const event = normalizeLiveNotificationEvent(row);
            if (!event) throw new Error("Notification normalization failed");
            await present(event, "reconnect", true);
          },
          saveCursor: saveStaffNotificationRecoveryCursor,
        });
        if (result.status === "complete") {
          clearStaffNotificationRecoveryPending(staffId);
          setRetryVisible(false);
          setRecoveryMessage(
            result.olderEventsSkipped
              ? "Notifications older than the 15-minute recovery window were skipped."
              : null,
          );
        } else {
          markStaffNotificationRecoveryPending(staffId);
          setRetryVisible(true);
          setRecoveryMessage(
            result.status === "incomplete"
              ? "More recent staff notifications are available. Continue recovery."
              : "Some staff notifications may not have loaded. Try recovery again.",
          );
        }
      } catch {
        markStaffNotificationRecoveryPending(staffId);
        setRetryVisible(true);
        setRecoveryMessage(
          "Some staff notifications may not have loaded. Try recovery again.",
        );
      } finally {
        recoveryInFlightRef.current = false;
        setRecoveryRunning(false);
        const recoveredSound = takeRecoveredSoundCandidate(recoveredSoundRef);
        if (recoveredSound) {
          void playStaffNotificationSound({
            eventId: recoveredSound.eventId,
            ownership: "winner",
            soundEnabled: true,
            eligible: true,
          });
        }
        if (recoveryAgainRef.current) {
          recoveryAgainRef.current = false;
          window.setTimeout(
            () => void runRecoveryRef.current?.("reconnect"),
            0,
          );
        }
      }
    },
    [present, staffId],
  );

  useEffect(() => {
    runRecoveryRef.current = runRecovery;
  }, [runRecovery]);

  useEffect(() => {
    startedAtRef.current ??= Date.now();
    if (mountedStaffIdRef.current !== staffId) {
      mountedStaffIdRef.current = staffId;
      startedAtRef.current = Date.now();
      setRetryVisible(hasStaffNotificationRecoveryPending(staffId));
    }
    const hasWebOrSound = notificationPreferences.some(
      (preference) => preference.webEnabled || preference.soundEnabled,
    );
    if (!hasWebOrSound) return;

    const supabase = createClient();
    let subscribedOnce = false;
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
          if (event) {
            void present(event, "live").catch(() => {
              markStaffNotificationRecoveryPending(staffId);
              setRetryVisible(true);
              setRecoveryMessage(
                "Some staff notifications may not have loaded. Try recovery again.",
              );
            });
            return;
          }
          const now = Date.now();
          if (now - malformedRecoveryAtRef.current < 30_000) return;
          malformedRecoveryAtRef.current = now;
          markStaffNotificationRecoveryPending(staffId);
          setRetryVisible(true);
          void runRecoveryRef.current?.("reconnect");
        },
      )
      .subscribe((status, error) => {
        if (status === "SUBSCRIBED") {
          const source = subscribedOnce ? "reconnect" : "page_load";
          subscribedOnce = true;
          void runRecoveryRef.current?.(source);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          markStaffNotificationRecoveryPending(staffId);
          setRetryVisible(true);
          console.warn("[staff-notifications] Realtime subscription failed", {
            status,
            hasError: Boolean(error),
          });
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [notificationPreferences, present, staffId]);

  return retryVisible || recoveryMessage ? (
    <div className="fixed bottom-4 left-4 z-[60] flex max-w-sm items-center gap-3 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm shadow">
      {recoveryMessage ? <p role="status">{recoveryMessage}</p> : null}
      {retryVisible ? (
        <button
          className="shrink-0 underline"
          disabled={recoveryRunning}
          onClick={() => void runRecovery("manual_retry")}
          type="button"
        >
          Retry
        </button>
      ) : null}
    </div>
  ) : null;
}
