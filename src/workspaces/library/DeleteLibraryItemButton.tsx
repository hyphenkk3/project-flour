"use client";

import { useTransition } from "react";

type DeleteLibraryItemButtonProps = {
  action: () => Promise<void>;
  label?: string;
};

export function DeleteLibraryItemButton({
  action,
  label = "Delete",
}: DeleteLibraryItemButtonProps) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      className="border-status-danger/30 text-status-danger hover:bg-status-danger-soft inline-flex min-h-11 items-center justify-center rounded-lg border px-4 text-sm font-medium transition disabled:opacity-60"
      disabled={pending}
      onClick={() => {
        if (
          !window.confirm(
            "Delete this library item? This cannot be undone from the UI.",
          )
        ) {
          return;
        }
        startTransition(() => {
          void action();
        });
      }}
      type="button"
    >
      {pending ? "Deleting…" : label}
    </button>
  );
}
