"use client";

import { useTransition } from "react";
import { confirmGuestOrderAction } from "@/workspaces/owner/orders/actions";

type ConfirmOrderButtonProps = {
  orderId: string;
};

export function ConfirmOrderButton({ orderId }: ConfirmOrderButtonProps) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 w-full items-center justify-center rounded-lg px-5 text-sm font-medium disabled:opacity-60 sm:w-auto"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await confirmGuestOrderAction(orderId);
        });
      }}
      type="button"
    >
      {pending ? "Confirming…" : "Confirm Order"}
    </button>
  );
}
