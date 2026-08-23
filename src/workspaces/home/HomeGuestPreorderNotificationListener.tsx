"use client";

import { useCallback, useEffect, useRef } from "react";

import { useToast } from "@/components/ui/Toast";

import { createClient } from "@/lib/supabase/client";

import type { StorefrontOrderListItem } from "@/types/storefront";

import {
  getGuestOrderListItemAction,
  listGuestOrdersAction,
} from "@/workspaces/owner/orders/actions";

import {
  GUEST_ORDERS_LIVE_POLL_MS,
  isGuestOrderLiveEvent,
  type GuestOrderLiveRow,
} from "@/workspaces/owner/orders/guest-orders-live";

import {
  buildGuestPreorderNotificationToast,
  GUEST_PREORDER_NOTIFIED_IDS_KEY,
  isGuestWholeCakeSubmittedPreorder,
  isGuestWholeCakeSubmittedPreorderLiveRow,
  markGuestPreorderNotificationsSeen,
  tryClaimGuestPreorderNotification,
} from "@/workspaces/owner/orders/guest-preorder-notifications";

import type {
  StaffNotificationPreference,
} from "@/foundation/staff/notification-preferences";

const HOME_RETURN = "/home";

type HomeGuestPreorderNotificationListenerProps = {
  staffId: string;
  initialOrderIds: string[];
  notificationPreference: StaffNotificationPreference;
};

export function HomeGuestPreorderNotificationListener({
  staffId,
  initialOrderIds,
  notificationPreference,
}: HomeGuestPreorderNotificationListenerProps) {
  const { toast } = useToast();

  const knownIdsRef = useRef(new Set(initialOrderIds));
  const notifiedIdsRef = useRef(new Set(initialOrderIds));

  const maybeNotify = useCallback(
    (item: StorefrontOrderListItem) => {
      if (!notificationPreference.webEnabled) return;
      if (notifiedIdsRef.current.has(item.id)) return;
      if (!isGuestWholeCakeSubmittedPreorder(item)) return;

      if (!tryClaimGuestPreorderNotification(item.id)) return;

      notifiedIdsRef.current.add(item.id);

      const payload = buildGuestPreorderNotificationToast(
        item,
        notificationPreference.webMode,
        HOME_RETURN,
      );

      if (payload) {
        toast(payload);
      }
    },
    [
      notificationPreference.webEnabled,
      notificationPreference.webMode,
      toast,
    ],
  );

  const loadListItem = useCallback(async (id: string) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const item = await getGuestOrderListItemAction(id);
      if (item) return item;

      await new Promise((resolve) =>
        window.setTimeout(resolve, 350),
      );
    }

    return null;
  }, []);

  const handleIncomingInsert = useCallback(
    async (row: GuestOrderLiveRow & { id: string }) => {
      if (knownIdsRef.current.has(row.id)) return;
      if (!isGuestWholeCakeSubmittedPreorderLiveRow(row)) return;

      const item = await loadListItem(row.id);
      if (!item) return;

      knownIdsRef.current.add(item.id);
      maybeNotify(item);
    },
    [loadListItem, maybeNotify],
  );

  const reconcileFromServer = useCallback(async () => {
    try {
      const latest = await listGuestOrdersAction();
      const previousKnown = knownIdsRef.current;

      const arrived: StorefrontOrderListItem[] = [];

      for (const item of latest) {
        if (
          !previousKnown.has(item.id) &&
          !notifiedIdsRef.current.has(item.id)
        ) {
          arrived.push(item);
        }

        knownIdsRef.current.add(item.id);
      }

      for (const item of arrived) {
        maybeNotify(item);
      }
    } catch {
      // Keep listening; HomeLiveRefresh still refreshes the cockpit.
    }
  }, [maybeNotify]);

  useEffect(() => {
    markGuestPreorderNotificationsSeen(initialOrderIds);

    for (const id of initialOrderIds) {
      knownIdsRef.current.add(id);
      notifiedIdsRef.current.add(id);
    }
  }, [initialOrderIds]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (
        event.key !== GUEST_PREORDER_NOTIFIED_IDS_KEY ||
        !event.newValue
      ) {
        return;
      }

      try {
        const ids = JSON.parse(event.newValue) as unknown;

        if (!Array.isArray(ids)) return;

        for (const id of ids) {
          if (typeof id === "string") {
            notifiedIdsRef.current.add(id);
          }
        }
      } catch {
        // ignore malformed cross-tab payload
      }
    };

    window.addEventListener("storage", onStorage);

    return () =>
      window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel("home-guest-preorder-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
        },
        (payload) => {
          const row = payload.new as GuestOrderLiveRow;

          if (!isGuestOrderLiveEvent(row)) return;

          void handleIncomingInsert(row);
        },
      )
      .subscribe();

    const pollId = window.setInterval(() => {
      void reconcileFromServer();
    }, GUEST_ORDERS_LIVE_POLL_MS);

    return () => {
      window.clearInterval(pollId);
      void supabase.removeChannel(channel);
    };
  }, [handleIncomingInsert, reconcileFromServer]);

  return null;
}
