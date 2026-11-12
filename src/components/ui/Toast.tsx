"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import type { ToastTone } from "@/lib/design-tokens";
import { appendStaffNotificationRecoveryTrace } from "@/foundation/staff/staff-notification-recovery-diagnostics";
import { retainLatestToastItems } from "@/foundation/ui/toast-retention";

export type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Omit for default transient auto-dismiss. `null` keeps the toast until closed. */
  durationMs?: number | null;
  actionHref?: string;
  actionLabel?: string;
  /** Internal opaque id used only by DEV recovery diagnostics. */
  notificationEventId?: string;
};

type ToastItem = ToastInput & {
  id: string;
  tone: ToastTone;
  durationMs: number | null;
};

type ToastContextValue = {
  toast: (input: ToastInput) => void;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION_MS = 4500;
const MAX_VISIBLE_TOASTS = 5;

function toneClasses(tone: ToastTone): string {
  switch (tone) {
    case "success":
      return "border-status-success/30 bg-white";
    case "warning":
      return "border-status-warning/30 bg-white";
    case "danger":
      return "border-status-danger/30 bg-white";
    case "info":
    default:
      return "border-signal/30 bg-white";
  }
}

function toneAccent(tone: ToastTone): string {
  switch (tone) {
    case "success":
      return "bg-status-success";
    case "warning":
      return "bg-status-warning";
    case "danger":
      return "bg-status-danger";
    case "info":
    default:
      return "bg-signal";
  }
}

export function ToastProvider({
  children,
  diagnosticsEnabled = false,
}: {
  children: ReactNode;
  diagnosticsEnabled?: boolean;
}) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const itemsRef = useRef(items);
  const mountedDiagnosticToastsRef = useRef(new Set<string>());
  const diagnosticsEnabledRef = useRef(diagnosticsEnabled);

  useEffect(() => {
    diagnosticsEnabledRef.current = diagnosticsEnabled;
  }, [diagnosticsEnabled]);

  useEffect(() => {
    itemsRef.current = items;
    if (!diagnosticsEnabled) return;
    for (const item of items) {
      if (
        item.notificationEventId &&
        !mountedDiagnosticToastsRef.current.has(item.id)
      ) {
        mountedDiagnosticToastsRef.current.add(item.id);
        appendStaffNotificationRecoveryTrace({
          kind: "toast_mounted",
          eventId: item.notificationEventId,
          outcome: "mounted",
        });
      }
    }
  }, [diagnosticsEnabled, items]);

  const dismiss = useCallback(
    (
      id: string,
      reason: "transient_timeout" | "user_dismissed" = "user_dismissed",
    ) => {
      const existing = itemsRef.current.find((item) => item.id === id);
      const next = itemsRef.current.filter((item) => item.id !== id);
      itemsRef.current = next;
      setItems(next);
      if (diagnosticsEnabledRef.current && existing?.notificationEventId) {
        appendStaffNotificationRecoveryTrace({
          kind:
            reason === "transient_timeout"
              ? "toast_expired"
              : "toast_dismissed",
          eventId: existing.notificationEventId,
          outcome: reason === "transient_timeout" ? "expired" : "dismissed",
          reason,
        });
      }
    },
    [],
  );

  const toast = useCallback(
    (input: ToastInput) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const tone = input.tone ?? "info";
      const durationMs =
        input.durationMs === undefined ? DEFAULT_DURATION_MS : input.durationMs;

      const nextItem = {
        id,
        title: input.title,
        description: input.description,
        tone,
        durationMs,
        actionHref: input.actionHref,
        actionLabel: input.actionLabel,
        notificationEventId: input.notificationEventId,
      };
      const { retained: next, evicted } = retainLatestToastItems(
        itemsRef.current,
        nextItem,
        MAX_VISIBLE_TOASTS,
      );
      itemsRef.current = next;
      setItems(next);
      if (diagnosticsEnabledRef.current && input.notificationEventId) {
        appendStaffNotificationRecoveryTrace({
          kind: "toast_queued",
          eventId: input.notificationEventId,
          outcome: "success",
        });
        appendStaffNotificationRecoveryTrace({
          kind: "toast_retained",
          eventId: input.notificationEventId,
          outcome: "retained",
        });
      }
      if (diagnosticsEnabledRef.current) {
        for (const item of evicted) {
          if (!item.notificationEventId) continue;
          appendStaffNotificationRecoveryTrace({
            kind: "toast_evicted",
            eventId: item.notificationEventId,
            outcome: "evicted",
            reason: "toast_limit",
          });
        }
      }

      if (durationMs != null) {
        window.setTimeout(() => {
          dismiss(id, "transient_timeout");
        }, durationMs);
      }
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-2 px-4 pt-4 pb-[env(safe-area-inset-top)] md:items-end md:pt-6 md:pr-6"
      >
        {items.map((item) => (
          <div
            className={`animate-toast-in border-fog pointer-events-auto flex w-full max-w-sm overflow-hidden rounded-xl border shadow-md ${toneClasses(item.tone)}`}
            key={item.id}
            role="status"
          >
            <span
              aria-hidden="true"
              className={`w-1 shrink-0 ${toneAccent(item.tone)}`}
            />
            <div className="min-w-0 flex-1 px-4 py-3">
              <p className="text-ink text-sm font-semibold">{item.title}</p>
              {item.description ? (
                <p className="text-skyline mt-1 text-sm whitespace-pre-line">
                  {item.description}
                </p>
              ) : null}
            </div>
            {item.actionHref ? (
              <Link
                className="text-signal hover:text-ink self-center px-2 text-sm font-medium whitespace-nowrap"
                href={item.actionHref}
                onClick={() => dismiss(item.id)}
              >
                {item.actionLabel ?? "Open"}
              </Link>
            ) : null}
            <button
              aria-label="Dismiss notification"
              className="text-skyline hover:text-ink px-3 text-sm font-medium"
              onClick={() => dismiss(item.id)}
              type="button"
            >
              Close
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within ToastProvider.");
  }

  return context;
}
