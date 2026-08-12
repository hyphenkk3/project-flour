"use client";

import { useEffect, useMemo, useState } from "react";
import {
  messageActionsForOperationalState,
  messageRecipientLabel,
  type MessageAction,
} from "@/engines/orders/message-availability";
import {
  generateOrderMessage,
  type MessageType,
  type OutForDeliveryAudience,
} from "@/engines/orders/messages";
import type { StorefrontOrder } from "@/types/storefront";
import { OrderMessagePreview } from "@/workspaces/owner/orders/OrderMessagePreview";

type OrderMessagesSectionProps = {
  order: StorefrontOrder;
  /** Authenticated staff display name — default Ready sender. */
  staffDisplayName: string;
  /** Quieter layout for dense surfaces. */
  compact?: boolean;
};

type PreviewState = {
  type: MessageType;
  title: string;
  audience?: OutForDeliveryAudience;
  contactName?: string;
  contactPhone?: string;
};

const crewButtonClass =
  "bg-ink text-mist hover:bg-skyline inline-flex min-h-10 w-full items-center justify-center rounded-lg px-4 text-sm font-medium";

/** Next customer action for the current operational stage. */
const customerPrimaryButtonClass =
  "border-skyline/40 bg-skyline/10 text-ink hover:bg-skyline/20 inline-flex min-h-10 w-full items-center justify-center rounded-lg border px-4 text-sm font-medium";

/** Still available, but not the next action. */
const customerSecondaryButtonClass =
  "border-fog text-skyline hover:bg-mist inline-flex min-h-10 w-full items-center justify-center rounded-lg border px-4 text-sm font-medium";

function MessageActionButton({
  action,
  className,
  onOpen,
}: {
  action: MessageAction;
  className: string;
  onOpen: (action: MessageAction) => void;
}) {
  return (
    <button
      className={className}
      onClick={() => onOpen(action)}
      type="button"
    >
      {action.title}
    </button>
  );
}

export function OrderMessagesSection({
  order,
  staffDisplayName,
  compact = false,
}: OrderMessagesSectionProps) {
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [senderName, setSenderName] = useState(
    () => staffDisplayName.trim() || "Whitebird",
  );

  useEffect(() => {
    if (!preview) {
      setSenderName(staffDisplayName.trim() || "Whitebird");
    }
  }, [staffDisplayName, preview]);

  const actions = useMemo(
    () =>
      messageActionsForOperationalState({
        readyAt: order.readyAt,
        pickedUpAt: order.pickedUpAt,
        outForDeliveryAt: order.outForDeliveryAt,
        deliveredAt: order.deliveredAt,
        fulfilmentMethod: order.fulfilmentMethod,
        order,
      }),
    [
      order,
      order.readyAt,
      order.pickedUpAt,
      order.outForDeliveryAt,
      order.deliveredAt,
      order.fulfilmentMethod,
    ],
  );

  const crewActions = actions.filter((action) => action.type === "crew");
  const customerActions = actions.filter((action) => action.type !== "crew");

  const generatedText = useMemo(() => {
    if (!preview) return "";
    return generateOrderMessage(preview.type, {
      order,
      senderName,
    });
  }, [preview, order, senderName]);

  function openAction(action: MessageAction) {
    if (
      action.type === "customer_ready" ||
      action.type === "customer_delivery_ready"
    ) {
      setSenderName(staffDisplayName.trim() || "Whitebird");
    }
    setPreview({
      type: action.type,
      title: action.title,
      audience: action.audience,
      contactName: action.contactName,
      contactPhone: action.contactPhone,
    });
  }

  return (
    <>
      <section
        className={
          compact
            ? "space-y-3"
            : "border-line space-y-3 rounded-lg border bg-mist/40 px-3 py-3"
        }
      >
        <div className="space-y-1">
          <h3 className="text-skyline text-[11px] font-semibold tracking-wide uppercase">
            Messages
          </h3>
          <p className="text-skyline text-xs">
            Copy for WhatsApp. Nothing is sent automatically.
          </p>
        </div>

        <div className="space-y-3">
          {crewActions.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-ink text-[10px] font-semibold tracking-[0.14em] uppercase">
                Internal · Crew
              </p>
              <div className="flex flex-col gap-2">
                {crewActions.map((action) => (
                  <MessageActionButton
                    action={action}
                    className={crewButtonClass}
                    key={action.type}
                    onOpen={openAction}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {customerActions.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-skyline text-[10px] font-semibold tracking-[0.14em] uppercase">
                Customer
              </p>
              <div className="flex flex-col gap-2">
                {customerActions.map((action) => (
                  <MessageActionButton
                    action={action}
                    className={
                      action.primary
                        ? customerPrimaryButtonClass
                        : customerSecondaryButtonClass
                    }
                    key={`${action.type}:${action.audience ?? "default"}`}
                    onOpen={openAction}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {preview ? (
        <OrderMessagePreview
          contactName={preview.contactName}
          contactPhone={preview.contactPhone}
          editable={preview.type === "crew"}
          generatedText={generatedText}
          onClose={() => setPreview(null)}
          onSenderNameChange={
            preview.type === "customer_ready" ||
            preview.type === "customer_delivery_ready"
              ? setSenderName
              : undefined
          }
          recipientLabel={messageRecipientLabel(preview.type, preview.audience)}
          senderName={senderName}
          title={preview.title}
          type={preview.type}
        />
      ) : null}
    </>
  );
}
