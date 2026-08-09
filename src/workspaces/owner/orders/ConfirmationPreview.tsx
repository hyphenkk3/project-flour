"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  buildConfirmationPayloadFromOrder,
  generateConfirmationMessage,
} from "@/engines/orders/confirmation-message";
import { buildWhatsAppDeepLink } from "@/engines/orders/whatsapp";
import type { StorefrontOrder } from "@/types/storefront";
import {
  markConfirmationSentAction,
  recordConfirmationPreparedAction,
} from "@/workspaces/owner/orders/actions";
import {
  ownerOrderWorkspaceHref,
  resolveOwnerReturnTo,
} from "@/workspaces/owner/navigation/return-to";

type ConfirmationPreviewProps = {
  order: StorefrontOrder;
  staffDisplayName: string;
  isUpdated: boolean;
  returnTo?: string;
};

export function ConfirmationPreview({
  order,
  staffDisplayName,
  isUpdated,
  returnTo,
}: ConfirmationPreviewProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [preparedLogged, setPreparedLogged] = useState(false);
  const back = resolveOwnerReturnTo(returnTo);
  const workspaceHref = ownerOrderWorkspaceHref(
    order.id,
    back.label === "Whole Cake Calendar" ? back.href : null,
  );

  const payload = buildConfirmationPayloadFromOrder({
    order,
    staffCustomerFacingName: staffDisplayName,
  });
  const message = generateConfirmationMessage(payload);
  const whatsappUrl = buildWhatsAppDeepLink(order.phone, message);

  useEffect(() => {
    const key = `wb-conf-prepared:${order.id}:${isUpdated ? "updated" : "first"}`;
    try {
      if (window.sessionStorage.getItem(key) === "1") {
        setPreparedLogged(true);
        return;
      }
      window.sessionStorage.setItem(key, "1");
    } catch {
      // sessionStorage unavailable — still log once via state.
    }
    if (preparedLogged) return;
    setPreparedLogged(true);
    void recordConfirmationPreparedAction(order.id, isUpdated);
  }, [order.id, isUpdated, preparedLogged]);

  function handleCopy() {
    void navigator.clipboard.writeText(message).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleOpenWhatsApp() {
    if (!order.phone.trim()) {
      setError("No WhatsApp phone on this order.");
      return;
    }
    if (!whatsappUrl) {
      setError("Could not build a WhatsApp link from this phone number.");
      return;
    }
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  }

  function handleMarkSent() {
    setError(null);
    startTransition(async () => {
      const result = await markConfirmationSentAction(order.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(workspaceHref);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          className="text-skyline hover:text-ink text-sm font-medium"
          href={workspaceHref}
        >
          ← Order Workspace
        </Link>
        <h1 className="font-display text-ink mt-3 text-2xl tracking-tight">
          {isUpdated ? "Updated Confirmation" : "Confirmation Preview"}
        </h1>
        <p className="text-skyline mt-1 text-sm">
          Review the WhatsApp message. Opening WhatsApp does not change the
          order status — only Mark as Sent does.
        </p>
      </div>

      <pre className="border-fog text-ink overflow-x-auto whitespace-pre-wrap rounded-xl border bg-white p-4 text-sm leading-relaxed">
        {message}
      </pre>

      {error ? (
        <p className="text-status-danger text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <button
          className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 items-center justify-center rounded-lg px-5 text-sm font-medium disabled:opacity-60"
          disabled={pending}
          onClick={handleMarkSent}
          type="button"
        >
          {pending ? "Saving…" : "Mark as Sent"}
        </button>
        <button
          className="border-fog text-ink hover:bg-mist inline-flex min-h-12 items-center justify-center rounded-lg border px-5 text-sm font-medium"
          onClick={handleOpenWhatsApp}
          type="button"
        >
          Open WhatsApp
        </button>
        <button
          className="border-fog text-ink hover:bg-mist inline-flex min-h-12 items-center justify-center rounded-lg border px-5 text-sm font-medium"
          onClick={handleCopy}
          type="button"
        >
          {copied ? "Copied" : "Copy Message"}
        </button>
        <Link
          className="text-skyline hover:text-ink inline-flex min-h-12 items-center justify-center px-2 text-sm font-medium"
          href={workspaceHref}
        >
          Back
        </Link>
      </div>
    </div>
  );
}
