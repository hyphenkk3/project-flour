"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { startVisibilityAwarePolling } from "@/lib/visibility-aware-polling";
import {
  GUEST_ORDERS_LIVE_POLL_MS,
  isGuestOrderLiveEvent,
  type GuestOrderLiveRow,
} from "@/workspaces/owner/orders/guest-orders-live";

/**
 * Home is server-rendered. Reuse the Operations guest-order live pattern:
 * postgres_changes + poll, then refresh the server cockpit model.
 */
export function HomeLiveRefresh() {
  const router = useRouter();
  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  useEffect(() => {
    const supabase = createClient();
    let refreshTimer: number | null = null;
    function refreshSoon() {
      if (refreshTimer !== null) return;
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        refresh();
      }, 120);
    }
    function cancelQueuedRefresh() {
      if (refreshTimer === null) return;
      window.clearTimeout(refreshTimer);
      refreshTimer = null;
    }
    const polling = startVisibilityAwarePolling({
      intervalMs: GUEST_ORDERS_LIVE_POLL_MS,
      poll: refreshSoon,
      onVisible: refreshSoon,
    });
    function refreshRealtimeImmediately() {
      polling.runRealtimeRefreshImmediately(refresh, cancelQueuedRefresh);
    }
    const channel = supabase
      .channel("home-guest-orders")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload) => {
          const row = payload.new as GuestOrderLiveRow;
          if (!isGuestOrderLiveEvent(row)) return;
          refreshRealtimeImmediately();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload) => {
          const row = payload.new as GuestOrderLiveRow;
          if (!isGuestOrderLiveEvent(row)) return;
          refreshRealtimeImmediately();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "extra_stock" },
        () => {
          refreshRealtimeImmediately();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "staff_notification_events",
        },
        (payload) => {
          const code = (payload.new as { code?: string | null }).code;
          if (code !== "waiting_list_new_request") return;
          refreshRealtimeImmediately();
        },
      )
      .subscribe();

    return () => {
      polling.dispose();
      cancelQueuedRefresh();
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  return null;
}
