"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
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
    const channel = supabase
      .channel("home-guest-orders")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload) => {
          const row = payload.new as GuestOrderLiveRow;
          if (!isGuestOrderLiveEvent(row)) return;
          refresh();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload) => {
          const row = payload.new as GuestOrderLiveRow;
          if (!isGuestOrderLiveEvent(row)) return;
          refresh();
        },
      )
      .subscribe();

    const pollId = window.setInterval(() => {
      refresh();
    }, GUEST_ORDERS_LIVE_POLL_MS);

    return () => {
      window.clearInterval(pollId);
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  return null;
}
