"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

type CheckoutConfirmPromptProps = {
  open: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onGoBack: () => void;
};

export function CheckoutConfirmPrompt({
  open,
  pending = false,
  onConfirm,
  onGoBack,
}: CheckoutConfirmPromptProps) {
  const titleId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || pending) return;
    confirmRef.current?.focus();
  }, [open, pending]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || pending) return;
      event.preventDefault();
      onGoBack();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onGoBack, open, pending]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div aria-hidden className="bg-ink/40 absolute inset-0" />
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="border-fog bg-mist text-ink absolute inset-x-0 bottom-0 z-[60] mx-auto w-full max-w-md rounded-t-2xl border px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-lg md:top-1/2 md:bottom-auto md:left-1/2 md:right-auto md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:pb-6"
        role="dialog"
      >
        <h2
          className="font-display text-ink text-2xl tracking-tight"
          id={titleId}
        >
          Would you like to confirm this order?
        </h2>
        <div className="mt-6 flex flex-col gap-3">
          <button
            className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 items-center justify-center rounded-full px-6 text-sm font-medium transition disabled:opacity-60"
            disabled={pending}
            onClick={onConfirm}
            ref={confirmRef}
            type="button"
          >
            {pending ? "Submitting…" : "Confirm Order"}
          </button>
          <button
            className="text-ink hover:text-skyline inline-flex min-h-12 items-center justify-center rounded-full px-6 text-sm font-medium disabled:opacity-60"
            disabled={pending}
            onClick={onGoBack}
            type="button"
          >
            Go Back
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
