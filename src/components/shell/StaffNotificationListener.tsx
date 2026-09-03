"use client";

import { useCallback, useEffect } from "react";

import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import type { StaffNotificationPreference } from "@/foundation/staff/notification-preferences";
import { STAFF_NOTIFICATION_DEFINITIONS } from "@/foundation/staff/notification-preferences";
import {
  buildStaffNotificationToast,
  tryClaimStaffNotification,
  type StaffNotificationEvent,
} from "@/foundation/staff/staff-notification-engine";

type StaffNotificationListenerProps = {
  notificationPreferences: StaffNotificationPreference[];
};

type NotificationEventLiveRow = {
  id?: string;
  event_key?: string | null;
  code?: string | null;
  order_id?: string | null;
  approval_id?: string | null;
  title?: string | null;
  description?: string | null;
  href?: string | null;
  payload?: Record<string, unknown> | null;
};

function isNotificationCode(
  value: string | null | undefined,
): value is StaffNotificationEvent["code"] {
  return STAFF_NOTIFICATION_DEFINITIONS.some(
    (definition) => definition.code === value,
  );
}

function toneFromCode(
  code: StaffNotificationEvent["code"],
): StaffNotificationEvent["tone"] {
  switch (code) {
    case "order_paid":
    case "order_confirmed":
      return "success";
    case "order_cancelled":
    case "approval_required":
    case "last_minute":
      return "warning";
    default:
      return "info";
  }
}

export function StaffNotificationListener({
  notificationPreferences,
}: StaffNotificationListenerProps) {
  const { toast } = useToast();

  const getPreference = useCallback(
    (code: StaffNotificationPreference["code"]) =>
      notificationPreferences.find((preference) => preference.code === code) ??
      null,
    [notificationPreferences],
  );

  const anyWebEnabled = notificationPreferences.some(
    (preference) => preference.webEnabled,
  );

  const showEvent = useCallback(
    (event: StaffNotificationEvent) => {
      const preference = getPreference(event.code);
      if (!preference?.webEnabled) return;
      if (!tryClaimStaffNotification(event.id)) return;

      toast(buildStaffNotificationToast(event, preference.webMode));
    },
    [getPreference, toast],
  );

  useEffect(() => {
    if (!anyWebEnabled) return;

    const supabase = createClient();
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
          const row = payload.new as NotificationEventLiveRow;
          if (!row.id || !isNotificationCode(row.code)) return;

          showEvent({
            id: row.id,
            code: row.code,
            orderId: row.order_id ?? null,
            title: row.title?.trim() || "Staff notification",
            description: row.description?.trim() || "",
            href: row.href ?? undefined,
            actionLabel:
              row.code === "approval_required" && !row.order_id
                ? "View approvals"
                : "View order",
            tone: toneFromCode(row.code),
          });
        },
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("[staff-notifications] Realtime subscription failed:", {
            status,
            error: err,
          });
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [anyWebEnabled, showEvent]);

  return null;
}
