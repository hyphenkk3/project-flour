"use client";

import { useMemo, useState, useTransition } from "react";
import { buildWhatsAppDeepLink } from "@/engines/orders/whatsapp";
import { generateCustomerThankYouMessage } from "@/engines/orders/messages";
import { formatTimelineDateTime } from "@/workspaces/owner/orders/labels";
import { OrderMessagePreview } from "@/workspaces/owner/orders/OrderMessagePreview";
import type { MessageType } from "@/engines/orders/messages";
import type { CollectionBoardOrder } from "@/workspaces/collection/types";
import { markCollectionReadyMessageSentAction } from "@/workspaces/collection/actions";
import {
  generateCollectionReadyMessage,
  selectCollectionWhatsAppMessage,
} from "@/workspaces/collection/ready-message";
import type { CollectionReadyMessageSent } from "@/workspaces/collection/types";

export function CollectionReadyMessage({
  order,
  staffDisplayName,
}: {
  order: CollectionBoardOrder;
  staffDisplayName: string;
}) {
  const [sent, setSent] = useState<CollectionReadyMessageSent | null>(
    order.readyMessageSent ?? null,
  );
  const [previewKind, setPreviewKind] = useState<"ready" | "thank_you" | null>(
    null,
  );
  const [senderName, setSenderName] = useState(
    () => staffDisplayName.trim() || "Whitebird",
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const messageType: MessageType =
    order.fulfilmentMethod === "delivery"
      ? "customer_delivery_ready"
      : "customer_ready";
  const message = useMemo(
    () => generateCollectionReadyMessage(order, senderName),
    [order, senderName],
  );
  const thankYouMessage = useMemo(() => generateCustomerThankYouMessage(), []);
  const selectedWhatsAppMessage = useMemo(
    () =>
      selectCollectionWhatsAppMessage(message, thankYouMessage, Boolean(sent)),
    [message, thankYouMessage, sent],
  );
  const whatsappUrl = useMemo(
    () =>
      buildWhatsAppDeepLink(
        order.guestPhone ?? "",
        selectedWhatsAppMessage.text,
      ),
    [order.guestPhone, selectedWhatsAppMessage.text],
  );
  const activeReady = Boolean(
    order.readyAt && !order.pickedUpAt && !order.deliveredAt,
  );

  if (!order.readyAt || (!activeReady && !sent)) return null;

  function markSent() {
    setError(null);
    startTransition(async () => {
      const result = await markCollectionReadyMessageSentAction(order.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.sentAt) {
        setSent({
          sentAt: result.sentAt,
          sentByName: result.sentByName ?? null,
        });
      }
    });
  }

  function openWhatsApp() {
    if (!whatsappUrl) return;
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <section
      aria-label="Customer ready message"
      className="border-fog space-y-3 rounded-2xl border bg-white px-4 py-3.5"
    >
      <div>
        <h2 className="text-ink text-xs font-semibold tracking-wide uppercase">
          CUSTOMER
        </h2>
        <p className="text-skyline mt-1 text-xs">
          Copy for WhatsApp. Nothing is sent automatically.
        </p>
      </div>
      <button
        className="border-skyline/40 bg-skyline/10 text-ink hover:bg-skyline/20 inline-flex min-h-11 w-full items-center justify-center rounded-lg border px-4 text-sm font-medium"
        onClick={() => {
          setSenderName(staffDisplayName.trim() || "Whitebird");
          setPreviewKind("ready");
        }}
        type="button"
      >
        Customer Ready Message
      </button>
      <button
        className="border-skyline/40 bg-skyline/10 text-ink hover:bg-skyline/20 inline-flex min-h-11 w-full items-center justify-center rounded-lg border px-4 text-sm font-medium"
        onClick={() => setPreviewKind("thank_you")}
        type="button"
      >
        Customer Thank You Message
      </button>
      {activeReady ? (
        <div className="flex flex-col gap-2">
          <button
            className="border-fog text-ink hover:bg-mist inline-flex min-h-11 w-full items-center justify-center rounded-lg border px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!whatsappUrl}
            onClick={openWhatsApp}
            type="button"
          >
            Open WhatsApp —{" "}
            {selectedWhatsAppMessage.kind === "ready"
              ? "Ready Message"
              : "Thank You Message"}
          </button>
          {!sent ? (
            <button
              className="bg-ink text-mist hover:bg-skyline inline-flex min-h-11 w-full items-center justify-center rounded-lg px-4 text-sm font-medium disabled:opacity-60"
              disabled={pending}
              onClick={markSent}
              type="button"
            >
              {pending ? "Saving…" : "Mark Ready Message Sent"}
            </button>
          ) : null}
        </div>
      ) : null}
      {sent ? (
        <p className="text-ink text-sm" role="status">
          ✓ Ready Message Sent
          <span className="text-skyline">
            {` · Sent by ${sent.sentByName ?? "Staff"} · ${formatTimelineDateTime(sent.sentAt)}`}
          </span>
        </p>
      ) : null}
      {error ? (
        <p className="text-status-danger text-sm" role="alert">
          {error}
        </p>
      ) : null}
      {previewKind ? (
        <OrderMessagePreview
          editable={false}
          generatedText={previewKind === "ready" ? message : thankYouMessage}
          onClose={() => setPreviewKind(null)}
          onSenderNameChange={
            previewKind === "ready" ? setSenderName : undefined
          }
          recipientLabel="CUSTOMER"
          senderName={senderName}
          title={
            previewKind === "ready"
              ? "Customer Ready Message"
              : "Customer Thank You Message"
          }
          type={previewKind === "ready" ? messageType : "customer_thank_you"}
        />
      ) : null}
    </section>
  );
}
