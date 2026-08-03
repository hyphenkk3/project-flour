"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type FormEvent,
  type ReactNode,
} from "react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive styling for irreversible actions. */
  tone?: "default" | "danger";
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  pending = false,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closingFromParentRef = useRef(false);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      dialog.showModal();
      return;
    }

    if (!open && dialog.open) {
      closingFromParentRef.current = true;
      dialog.close();
    }
  }, [open]);

  const handleCancel = useCallback(() => {
    if (pending) {
      return;
    }
    onCancel();
  }, [onCancel, pending]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    onConfirm();
  }

  return (
    <dialog
      aria-describedby={description ? descriptionId : undefined}
      aria-labelledby={titleId}
      className="border-fog text-ink backdrop:bg-ink/40 fixed top-1/2 left-1/2 z-50 w-[min(100%-2rem,24rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-white p-0 shadow-lg open:flex open:flex-col"
      onCancel={(event) => {
        event.preventDefault();
        handleCancel();
      }}
      onClose={() => {
        if (closingFromParentRef.current) {
          closingFromParentRef.current = false;
          return;
        }
        handleCancel();
      }}
      ref={dialogRef}
    >
      <form className="flex flex-col gap-5 p-5" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <h2 className="text-ink text-lg font-semibold" id={titleId}>
            {title}
          </h2>
          {description ? (
            <p className="text-skyline text-sm" id={descriptionId}>
              {description}
            </p>
          ) : null}
          {children}
        </div>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            className="border-fog text-ink inline-flex min-h-12 items-center justify-center rounded-lg border bg-white px-5 text-sm font-medium disabled:opacity-60"
            disabled={pending}
            onClick={handleCancel}
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            className={
              tone === "danger"
                ? "bg-status-danger inline-flex min-h-12 items-center justify-center rounded-lg px-5 text-sm font-medium text-white transition disabled:opacity-60"
                : "bg-ink text-mist hover:bg-skyline inline-flex min-h-12 items-center justify-center rounded-lg px-5 text-sm font-medium transition disabled:opacity-60"
            }
            disabled={pending}
            type="submit"
          >
            {pending ? "Working…" : confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
