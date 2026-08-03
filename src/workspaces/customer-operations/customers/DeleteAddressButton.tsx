"use client";

import { useTransition } from "react";
import { deleteAddressAction } from "@/workspaces/customer-operations/customers/actions";

type DeleteAddressButtonProps = {
  customerId: string;
  addressId: string;
  addressLabel: string;
};

export function DeleteAddressButton({
  customerId,
  addressId,
  addressLabel,
}: DeleteAddressButtonProps) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      className="text-skyline min-h-11 shrink-0 text-sm font-medium hover:text-red-800 disabled:opacity-60"
      disabled={pending}
      onClick={() => {
        const confirmed = window.confirm(
          `Delete “${addressLabel}”? This cannot be undone.`,
        );
        if (!confirmed) {
          return;
        }

        startTransition(async () => {
          await deleteAddressAction(customerId, addressId);
        });
      }}
      type="button"
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}
