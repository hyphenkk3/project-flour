"use client";

import type { ReactNode } from "react";
import {
  OWNER_ATTENTION_SUPPORTING_COPY,
  OWNER_CUSTOMER_CONFIRMED_ACTION_ID,
  OWNER_ORDER_PAYMENT_SECTION_ID,
  deriveOwnerAttention,
  ownerAttentionInputFromOrder,
  type OwnerAttentionReason,
  type OwnerAttentionReasonKey,
} from "@/engines/operations/owner-attention";
import type { GuestOrderWorkspaceCapabilities } from "@/engines/orders/delivery-finance-capabilities";
import { focusDeliveryChargesSection } from "@/workspaces/owner/orders/missing-delivery-fee-confirmation";
import { CustomerConfirmedButton } from "@/workspaces/owner/orders/CustomerConfirmedButton";
import type { StorefrontOrder } from "@/types/storefront";

type OrderWorkspaceAttentionBlockProps = {
  order: StorefrontOrder;
  capabilities: GuestOrderWorkspaceCapabilities;
  onPrepareConfirmation: (updated: boolean) => void;
};

const primaryButtonClass =
  "bg-ink text-mist hover:bg-skyline inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg px-4 text-sm font-medium";
const secondaryButtonClass =
  "border-fog text-ink hover:bg-mist inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg border bg-white px-4 text-sm font-medium";

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function ReasonRow({
  reason,
  action,
}: {
  reason: OwnerAttentionReason;
  action: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <p className="text-status-warning text-sm font-semibold">
          {reason.label}
        </p>
        <p className="text-ink mt-0.5 text-sm leading-relaxed">
          {OWNER_ATTENTION_SUPPORTING_COPY[reason.key]}
        </p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function OrderWorkspaceAttentionBlock({
  order,
  capabilities,
  onPrepareConfirmation,
}: OrderWorkspaceAttentionBlockProps) {
  const reasons = deriveOwnerAttention(ownerAttentionInputFromOrder(order));
  if (reasons.length === 0) return null;

  const keys = new Set(reasons.map((r) => r.key));
  const paymentActionKey: OwnerAttentionReasonKey | null = keys.has(
    "payment_overdue",
  )
    ? "payment_overdue"
    : keys.has("payment_needed")
      ? "payment_needed"
      : null;

  function actionFor(key: OwnerAttentionReasonKey): ReactNode {
    switch (key) {
      case "prepare_confirmation":
        return capabilities.canPrepareConfirmation ? (
          <button
            className={primaryButtonClass}
            onClick={() => onPrepareConfirmation(false)}
            type="button"
          >
            Prepare Confirmation
          </button>
        ) : null;
      case "reconfirmation_required":
        return capabilities.canPrepareConfirmation ? (
          <button
            className={primaryButtonClass}
            onClick={() => onPrepareConfirmation(true)}
            type="button"
          >
            Prepare Updated Confirmation
          </button>
        ) : null;
      case "awaiting_customer_confirmation":
        return capabilities.canPrepareConfirmation ? (
          <div id={OWNER_CUSTOMER_CONFIRMED_ACTION_ID}>
            <CustomerConfirmedButton orderId={order.id} />
          </div>
        ) : null;
      case "payment_needed":
      case "payment_overdue":
        if (paymentActionKey !== key) return null;
        return (
          <button
            className={primaryButtonClass}
            onClick={() => scrollToId(OWNER_ORDER_PAYMENT_SECTION_ID)}
            type="button"
          >
            Go to Payment
          </button>
        );
      case "fee_request_pending":
        return (
          <button
            className={secondaryButtonClass}
            onClick={() => focusDeliveryChargesSection()}
            type="button"
          >
            Review Delivery Charges
          </button>
        );
      default:
        return null;
    }
  }

  return (
    <section
      aria-label="Needs attention"
      className="border-status-warning/30 bg-status-warning-soft rounded-lg border px-4 py-3"
    >
      <p className="text-status-warning text-[11px] font-bold tracking-[0.14em] uppercase">
        Needs Attention
      </p>
      <ul className="mt-3 space-y-3">
        {reasons.map((reason) => (
          <li key={reason.key}>
            <ReasonRow action={actionFor(reason.key)} reason={reason} />
          </li>
        ))}
      </ul>
    </section>
  );
}
