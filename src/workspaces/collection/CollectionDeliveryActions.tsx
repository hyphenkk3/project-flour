"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  markOrderDeliveredAction,
  markOrderOutForDeliveryAction,
  undoOrderDeliveredAction,
  undoOrderOutForDeliveryAction,
} from "@/workspaces/owner/orders/actions";
import {
  collectionDeliveryActions,
  type CollectionDeliveryAction,
} from "@/workspaces/collection/eligibility";

const ACTIONS: Record<
  CollectionDeliveryAction,
  {
    label: string;
    run: (orderId: string) => Promise<{ error: string | null }>;
    className: string;
  }
> = {
  mark_out_for_delivery: {
    label: "Mark Out for Delivery",
    run: markOrderOutForDeliveryAction,
    className: "bg-ink text-mist hover:bg-signal",
  },
  mark_delivered: {
    label: "Mark Delivered",
    run: markOrderDeliveredAction,
    className: "bg-ink text-mist hover:bg-signal",
  },
  undo_out_for_delivery: {
    label: "Undo Out for Delivery",
    run: undoOrderOutForDeliveryAction,
    className: "border-fog text-ink hover:border-skyline border bg-white",
  },
  undo_delivered: {
    label: "Undo Delivered",
    run: undoOrderDeliveredAction,
    className: "border-fog text-ink hover:border-skyline border bg-white",
  },
};

export function CollectionDeliveryActions({
  orderId,
  canManageDelivery,
  readyAt,
  outForDeliveryAt,
  deliveredAt,
}: {
  orderId: string;
  canManageDelivery: boolean;
  readyAt: string | null;
  outForDeliveryAt: string | null;
  deliveredAt: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<CollectionDeliveryAction | null>(
    null,
  );
  const actions = collectionDeliveryActions({
    canManageDelivery,
    readyAt,
    outForDeliveryAt,
    deliveredAt,
  });

  if (actions.length === 0) return null;

  function run(action: CollectionDeliveryAction) {
    setError(null);
    setBusyAction(action);
    startTransition(async () => {
      try {
        const result = await ACTIONS[action].run(orderId);
        if (result.error) {
          setError(result.error);
          return;
        }
        router.refresh();
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not update Delivery status.",
        );
      } finally {
        setBusyAction(null);
      }
    });
  }

  return (
    <section aria-label="Delivery actions" className="space-y-2">
      {error ? (
        <p className="text-status-danger text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2 sm:justify-end">
        {actions.map((action) => (
          <button
            key={action}
            className={`inline-flex min-h-12 flex-1 items-center justify-center rounded-xl px-5 text-sm font-semibold transition disabled:opacity-60 sm:min-w-[12rem] sm:flex-none ${ACTIONS[action].className}`}
            disabled={pending}
            onClick={() => run(action)}
            type="button"
          >
            {pending && busyAction === action
              ? "Working…"
              : ACTIONS[action].label}
          </button>
        ))}
      </div>
    </section>
  );
}
