"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import type { ToastTone } from "@/lib/design-tokens";

export type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Omit for default transient auto-dismiss. `null` keeps the toast until closed. */
  durationMs?: number | null;
  actionHref?: string;
  actionLabel?: string;
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

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const tone = input.tone ?? "info";
      const durationMs =
        input.durationMs === undefined
          ? DEFAULT_DURATION_MS
          : input.durationMs;

      setItems((current) => {
        const next = [
          ...current,
          {
            id,
            title: input.title,
            description: input.description,
            tone,
            durationMs,
            actionHref: input.actionHref,
            actionLabel: input.actionLabel,
          },
        ];
        return next.length > MAX_VISIBLE_TOASTS
          ? next.slice(next.length - MAX_VISIBLE_TOASTS)
          : next;
      });

      if (durationMs != null) {
        window.setTimeout(() => {
          dismiss(id);
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
