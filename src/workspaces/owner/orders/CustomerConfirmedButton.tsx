"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { customerConfirmedAction } from "@/workspaces/owner/orders/actions";

type CustomerConfirmedButtonProps = {
  orderId: string;
  disabled?: boolean;
};

export function CustomerConfirmedButton({
  orderId,
  disabled = false,
}: CustomerConfirmedButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await customerConfirmedAction(orderId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <button
        className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 w-full items-center justify-center rounded-lg px-5 text-sm font-medium disabled:opacity-60 sm:w-auto"
        disabled={disabled || pending}
        onClick={() => setOpen(true)}
        type="button"
      >
        Customer Confirmed
      </button>
      {error ? <p className="text-status-danger text-sm">{error}</p> : null}

      {open ? (
        <div className="border-fog fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div
            className="w-full max-w-sm rounded-xl border bg-white p-5 shadow-lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="customer-confirmed-title"
          >
            <h2
              className="text-ink text-base font-semibold"
              id="customer-confirmed-title"
            >
              Mark this preorder as confirmed by the customer?
            </h2>
            <p className="text-skyline mt-2 text-sm">
              Status will become Awaiting Payment. Payment itself is not
              collected here.
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                className="border-fog text-ink inline-flex min-h-11 items-center justify-center rounded-lg border px-4 text-sm font-medium"
                disabled={pending}
                onClick={() => setOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="bg-ink text-mist inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-medium disabled:opacity-60"
                disabled={pending}
                onClick={confirm}
                type="button"
              >
                {pending ? "Saving…" : "Customer Confirmed"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
