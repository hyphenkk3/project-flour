"use client";

import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import type { StorefrontOrder } from "@/types/storefront";
import { DeliveryFinanceBreakdown } from "@/workspaces/owner/orders/DeliveryFinanceBreakdown";
import { OrderDiscountsPanel } from "@/workspaces/owner/orders/OrderDiscountsPanel";
import type { OperationsApprovalRecord } from "@/engines/operations/approvals";

type OrderTotalAdjustmentsSectionProps = {
  order: StorefrontOrder;
  canOverrideDiscountEligibility?: boolean;
  canRequestOperationsApproval?: boolean;
  pendingDiscountApproval?: OperationsApprovalRecord | null;
};

/**
 * Pre-confirmation (and pending_confirmation) pricing stage.
 * Not Payment — no collection/history here.
 */
export function OrderTotalAdjustmentsSection({
  order,
  canOverrideDiscountEligibility = false,
  canRequestOperationsApproval = false,
  pendingDiscountApproval = null,
}: OrderTotalAdjustmentsSectionProps) {
  const settlement = order.settlement;

  return (
    <section className="border-fog space-y-4 rounded-xl border bg-white p-5">
      <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
        Order Total / Adjustments
      </h2>
      <p className="text-skyline text-xs">
        Establish the final amount before confirming with the customer.
      </p>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-skyline">Subtotal</dt>
          <dd className="text-ink font-semibold">
            {formatRm(settlement.subtotal)}
          </dd>
        </div>
        <div>
          <dt className="text-skyline">Amount due</dt>
          <dd className="text-ink font-semibold">
            {formatRm(settlement.amountDue)}
          </dd>
        </div>
      </dl>
      <DeliveryFinanceBreakdown order={order} />
      <OrderDiscountsPanel
        canOverrideDiscountEligibility={canOverrideDiscountEligibility}
        canRequestOperationsApproval={canRequestOperationsApproval}
        order={order}
        pendingDiscountApproval={pendingDiscountApproval}
      />
    </section>
  );
}
