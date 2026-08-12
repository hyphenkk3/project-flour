"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MessageType } from "@/engines/orders/messages";

type OrderMessagePreviewProps = {
  type: MessageType;
  title: string;
  /** Recipient cue e.g. INTERNAL · CREW / CUSTOMER — does not change titles. */
  recipientLabel: string;
  /** Canonical generated text for this open. */
  generatedText: string;
  /** Crew only: temporary free edit before Copy. */
  editable: boolean;
  /** Ready only: sender name control. */
  senderName?: string;
  onSenderNameChange?: (value: string) => void;
  /** Out for Delivery: intended copy target (manual WhatsApp). */
  contactName?: string;
  contactPhone?: string;
  onClose: () => void;
};

/**
 * Message preview modal — portaled to document.body so it is never sized /
 * positioned relative to Calendar Quick View’s nested &lt;dialog&gt; sheet.
 * Closing does not dismiss the parent Quick View.
 */
export function OrderMessagePreview({
  type,
  title,
  recipientLabel,
  generatedText,
  editable,
  senderName,
  onSenderNameChange,
  contactName,
  contactPhone,
  onClose,
}: OrderMessagePreviewProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closingFromParentRef = useRef(false);
  const [mounted, setMounted] = useState(false);
  const [draft, setDraft] = useState(generatedText);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) {
      dialog.showModal();
    }
  }, [mounted]);

  useEffect(() => {
    setDraft(generatedText);
    setCopied(false);
    setCopyError(null);
  }, [generatedText, type]);

  async function handleCopy() {
    setCopyError(null);
    const text = editable ? draft : generatedText;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError("Could not copy. Select the text and copy manually.");
    }
  }

  function requestClose() {
    closingFromParentRef.current = true;
    dialogRef.current?.close();
    onClose();
  }

  const showSender =
    (type === "customer_ready" || type === "customer_delivery_ready") &&
    onSenderNameChange != null;
  const contactHint =
    contactName || contactPhone
      ? [contactName?.trim(), contactPhone?.trim()].filter(Boolean).join(" · ")
      : null;

  if (!mounted) return null;

  return createPortal(
    <dialog
      aria-labelledby={titleId}
      aria-modal="true"
      className="text-ink fixed inset-0 z-[70] m-0 flex h-dvh max-h-dvh w-full max-w-none items-end justify-center border-0 bg-transparent p-0 shadow-none sm:items-center open:flex backdrop:bg-ink/40"
      onCancel={(event) => {
        // Prevent Escape from also dismissing Calendar Quick View underneath.
        event.preventDefault();
        requestClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          requestClose();
        }
      }}
      onClose={() => {
        if (closingFromParentRef.current) {
          closingFromParentRef.current = false;
          return;
        }
        onClose();
      }}
      ref={dialogRef}
    >
      <div
        className="border-line flex h-[min(90dvh,40rem)] w-full max-w-lg flex-col rounded-t-xl border bg-white shadow-xl sm:rounded-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="border-line flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3 sm:px-5">
          <div className="min-w-0 space-y-0.5">
            <p
              className={[
                "text-[11px] font-semibold tracking-wide uppercase",
                type === "crew" ? "text-ink" : "text-skyline",
              ].join(" ")}
            >
              {recipientLabel}
            </p>
            <h2 className="text-ink text-base font-semibold" id={titleId}>
              {title}
            </h2>
          </div>
          <button
            aria-label="Close message preview"
            className="text-skyline hover:bg-mist hover:text-ink inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl leading-none"
            onClick={requestClose}
            type="button"
          >
            ×
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-4 py-4 sm:px-5">
          {contactHint ? (
            <p className="text-skyline shrink-0 text-xs">
              Intended for {contactHint}. Copy for WhatsApp — nothing is sent
              automatically.
            </p>
          ) : null}

          {showSender ? (
            <div className="shrink-0 space-y-1.5">
              <label
                className="text-skyline text-[11px] font-semibold tracking-wide uppercase"
                htmlFor="message-sender-name"
              >
                Sender
              </label>
              <input
                className="border-line text-ink focus:border-skyline w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
                id="message-sender-name"
                onChange={(event) => onSenderNameChange(event.target.value)}
                type="text"
                value={senderName ?? ""}
              />
              <p className="text-skyline text-xs">
                Used in “Good morning, … here”. Override if someone else is
                sending.
              </p>
            </div>
          ) : null}

          {editable ? (
            <div className="flex min-h-0 flex-1 flex-col gap-1.5">
              <label
                className="text-skyline shrink-0 text-[11px] font-semibold tracking-wide uppercase"
                htmlFor="message-crew-draft"
              >
                Preview (editable)
              </label>
              <textarea
                className="border-line text-ink focus:border-skyline min-h-[12rem] w-full flex-1 resize-none rounded-lg border px-3 py-2.5 font-mono text-sm leading-relaxed outline-none"
                id="message-crew-draft"
                onChange={(event) => {
                  setDraft(event.target.value);
                  setCopied(false);
                }}
                spellCheck={false}
                value={draft}
              />
              <p className="text-skyline shrink-0 text-xs">
                Temporary edits apply to this copy only. Closing resets to
                generated text.
              </p>
            </div>
          ) : (
            <pre className="border-line bg-mist/50 text-ink min-h-0 flex-1 overflow-auto rounded-lg border px-3 py-3 font-mono text-sm leading-relaxed whitespace-pre-wrap">
              {generatedText}
            </pre>
          )}

          {copyError ? (
            <p className="text-status-danger shrink-0 text-sm" role="alert">
              {copyError}
            </p>
          ) : null}
        </div>

        <footer className="border-line flex shrink-0 flex-wrap gap-2 border-t px-4 py-3 sm:px-5">
          <button
            className="bg-ink text-mist hover:bg-skyline inline-flex min-h-11 flex-1 items-center justify-center rounded-lg px-5 text-sm font-medium"
            onClick={() => void handleCopy()}
            type="button"
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
          <button
            className="border-line text-ink hover:bg-mist inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border px-5 text-sm font-medium"
            onClick={requestClose}
            type="button"
          >
            Close
          </button>
        </footer>
      </div>
    </dialog>,
    document.body,
  );
}
