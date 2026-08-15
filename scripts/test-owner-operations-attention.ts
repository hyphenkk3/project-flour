/**
 * Operations Smoothness Pass Slice 1 — Owner attention helpers (no DB).
 * Run: npx tsx scripts/test-owner-operations-attention.ts
 */
import assert from "node:assert/strict";
import { isReconfirmationCurrentlyActionable } from "@/engines/orders/confirmation-validity";
import { isFulfilmentTerminal } from "@/engines/orders/operational-state";
import {
  DEFAULT_OPERATIONS_QUERY,
  filterAndSortOperationsOrders,
  isOperationsQueryDefault,
  type OperationsBoardOrder,
} from "@/engines/operations/order-board";
import {
  deriveOwnerAttention,
  ownerAttentionInputFromOrder,
  ownerOperationsTodayGroup,
  partitionOwnerOperationsTodayOrders,
} from "@/engines/operations/owner-attention";
import type { StorefrontOrderFulfilmentMethod } from "@/types/storefront";

type AttentionFixture = {
  id: string;
  status: "submitted" | "pending_confirmation" | "awaiting_payment" | "paid";
  confirmationNeedsResend: boolean;
  fulfilmentMethod: StorefrontOrderFulfilmentMethod;
  readyAt: string | null;
  pickedUpAt: string | null;
  outForDeliveryAt: string | null;
  deliveredAt: string | null;
  paymentDeadlineAt?: string | null;
  hasPendingFeeRequest?: boolean;
  pickupTime: string;
  orderNumber: string;
  createdAt: string;
};

function base(partial: Partial<AttentionFixture> & Pick<AttentionFixture, "id" | "status">): AttentionFixture {
  return {
    confirmationNeedsResend: false,
    fulfilmentMethod: "pickup",
    readyAt: null,
    pickedUpAt: null,
    outForDeliveryAt: null,
    deliveredAt: null,
    paymentDeadlineAt: null,
    hasPendingFeeRequest: false,
    pickupTime: "14:30",
    orderNumber: "WB-TEST",
    createdAt: "2026-08-14T00:00:00.000Z",
    ...partial,
  };
}

// 1. TODAY + submitted → prepare_confirmation
{
  const order = base({ id: "1", status: "submitted", pickupTime: "10:00" });
  const reasons = deriveOwnerAttention(order);
  assert.equal(ownerOperationsTodayGroup(order), "needs_attention");
  assert.deepEqual(
    reasons.map((r) => r.key),
    ["prepare_confirmation"],
  );
  assert.equal(reasons[0]?.label, "Confirmation not prepared");
}

// 2. pending_confirmation → awaiting_customer_confirmation
{
  const order = base({ id: "2", status: "pending_confirmation" });
  const reasons = deriveOwnerAttention(order);
  assert.equal(ownerOperationsTodayGroup(order), "needs_attention");
  assert.deepEqual(
    reasons.map((r) => r.key),
    ["awaiting_customer_confirmation"],
  );
}

// 3. awaiting_payment → payment_needed
{
  const order = base({ id: "3", status: "awaiting_payment" });
  const reasons = deriveOwnerAttention(order);
  assert.equal(ownerOperationsTodayGroup(order), "needs_attention");
  assert.ok(reasons.some((r) => r.key === "payment_needed"));
  assert.equal(
    reasons.find((r) => r.key === "payment_needed")?.label,
    "Payment needed",
  );
}

// 4. paid + actionable reconfirmation
{
  const order = base({
    id: "4",
    status: "paid",
    confirmationNeedsResend: true,
  });
  assert.equal(
    isReconfirmationCurrentlyActionable(order),
    true,
  );
  const reasons = deriveOwnerAttention(order);
  assert.equal(ownerOperationsTodayGroup(order), "needs_attention");
  assert.deepEqual(
    reasons.map((r) => r.key),
    ["reconfirmation_required"],
  );
}

// 5. paid + no attention + not terminal → All Clear
{
  const order = base({ id: "5", status: "paid" });
  assert.equal(deriveOwnerAttention(order).length, 0);
  assert.equal(ownerOperationsTodayGroup(order), "all_clear");
}

// 6. pickup picked_up + confirmationNeedsResend → Completed, not actionable
{
  const order = base({
    id: "6",
    status: "paid",
    confirmationNeedsResend: true,
    pickedUpAt: "2026-08-14T08:00:00.000Z",
    readyAt: "2026-08-14T06:00:00.000Z",
  });
  assert.equal(isFulfilmentTerminal(order), true);
  assert.equal(isReconfirmationCurrentlyActionable(order), false);
  assert.equal(ownerOperationsTodayGroup(order), "completed");
  assert.equal(deriveOwnerAttention(order).length, 0);
  // Historical flag remains on the object
  assert.equal(order.confirmationNeedsResend, true);
}

// 7. delivery delivered + confirmationNeedsResend → Completed
{
  const order = base({
    id: "7",
    status: "paid",
    fulfilmentMethod: "delivery",
    confirmationNeedsResend: true,
    readyAt: "2026-08-14T06:00:00.000Z",
    outForDeliveryAt: "2026-08-14T07:00:00.000Z",
    deliveredAt: "2026-08-14T09:00:00.000Z",
  });
  assert.equal(isReconfirmationCurrentlyActionable(order), false);
  assert.equal(ownerOperationsTodayGroup(order), "completed");
}

// 8. delivery out_for_delivery + reconfirmation remains actionable
{
  const order = base({
    id: "8",
    status: "paid",
    fulfilmentMethod: "delivery",
    confirmationNeedsResend: true,
    readyAt: "2026-08-14T06:00:00.000Z",
    outForDeliveryAt: "2026-08-14T07:00:00.000Z",
    deliveredAt: null,
  });
  assert.equal(isFulfilmentTerminal(order), false);
  assert.equal(isReconfirmationCurrentlyActionable(order), true);
  assert.equal(ownerOperationsTodayGroup(order), "needs_attention");
  assert.ok(
    deriveOwnerAttention(order).some((r) => r.key === "reconfirmation_required"),
  );
}

// 9. Multiple reasons retained
{
  const order = base({
    id: "9",
    status: "awaiting_payment",
    confirmationNeedsResend: true,
    hasPendingFeeRequest: true,
    paymentDeadlineAt: "2020-01-01T00:00:00.000Z",
  });
  const keys = deriveOwnerAttention(order).map((r) => r.key);
  assert.ok(keys.includes("payment_needed"));
  assert.ok(keys.includes("payment_overdue"));
  assert.ok(keys.includes("reconfirmation_required"));
  assert.ok(keys.includes("fee_request_pending"));
  assert.equal(keys.length, 4);
}

// Partition + sort by pickup time within Needs Attention
{
  const buckets = partitionOwnerOperationsTodayOrders([
    base({
      id: "late",
      status: "submitted",
      pickupTime: "17:00",
      orderNumber: "B",
    }),
    base({
      id: "early",
      status: "awaiting_payment",
      pickupTime: "11:00",
      orderNumber: "A",
    }),
    base({
      id: "clear",
      status: "paid",
      pickupTime: "12:00",
      orderNumber: "C",
    }),
    base({
      id: "done",
      status: "paid",
      pickupTime: "09:00",
      pickedUpAt: "2026-08-14T10:00:00.000Z",
      confirmationNeedsResend: true,
      orderNumber: "D",
    }),
  ]);
  assert.deepEqual(
    buckets.needsAttention.map((o) => o.id),
    ["early", "late"],
  );
  assert.deepEqual(
    buckets.allClear.map((o) => o.id),
    ["clear"],
  );
  assert.deepEqual(
    buckets.completed.map((o) => o.id),
    ["done"],
  );
}

// Defaults: Today
assert.equal(DEFAULT_OPERATIONS_QUERY.pickupFilter, "today");
assert.equal(isOperationsQueryDefault(DEFAULT_OPERATIONS_QUERY), true);
assert.equal(
  isOperationsQueryDefault({
    ...DEFAULT_OPERATIONS_QUERY,
    pickupFilter: "all",
  }),
  false,
);

// Non-Today filters still work via order-board
{
  const rows: OperationsBoardOrder[] = [
    {
      id: "t",
      orderNumber: "1",
      customerName: "A",
      phone: "1",
      pickupDate: "2026-08-15",
      pickupTime: "10:00",
      status: "paid",
      createdAt: "2026-08-01T00:00:00.000Z",
    },
    {
      id: "todayish",
      orderNumber: "2",
      customerName: "B",
      phone: "2",
      pickupDate: "2026-08-14",
      pickupTime: "10:00",
      status: "submitted",
      createdAt: "2026-08-01T00:00:00.000Z",
    },
  ];
  const tomorrow = filterAndSortOperationsOrders(rows, {
    ...DEFAULT_OPERATIONS_QUERY,
    pickupFilter: "tomorrow",
  });
  // Relative to "now" — this assertion only checks filter machinery accepts tomorrow
  assert.ok(Array.isArray(tomorrow));

  const all = filterAndSortOperationsOrders(rows, {
    ...DEFAULT_OPERATIONS_QUERY,
    pickupFilter: "all",
  });
  assert.equal(all.length, 2);

  const searched = filterAndSortOperationsOrders(rows, {
    ...DEFAULT_OPERATIONS_QUERY,
    pickupFilter: "all",
    search: "B",
  });
  assert.equal(searched.length, 1);
  assert.equal(searched[0]?.id, "todayish");

  const todayWindowSearch = filterAndSortOperationsOrders(
    rows,
    { ...DEFAULT_OPERATIONS_QUERY, search: "B" },
    new Date("2026-08-15T08:00:00+08:00"),
  );
  assert.equal(todayWindowSearch.length, 1);
  assert.equal(todayWindowSearch[0]?.id, "todayish");

  const byStatus = filterAndSortOperationsOrders(rows, {
    ...DEFAULT_OPERATIONS_QUERY,
    pickupFilter: "all",
    statusFilter: "submitted",
  });
  assert.equal(byStatus.length, 1);
  assert.equal(byStatus[0]?.status, "submitted");
}

// Workspace mapping: Storefront-shaped order → same attention keys
{
  const mapped = ownerAttentionInputFromOrder({
    status: "awaiting_payment",
    confirmationNeedsResend: false,
    fulfilmentMethod: "pickup",
    readyAt: null,
    pickedUpAt: null,
    paymentDeadlineAt: "2020-01-01T00:00:00.000Z",
    delivery: null,
  });
  const keys = deriveOwnerAttention(mapped).map((r) => r.key);
  assert.ok(keys.includes("payment_needed"));
  assert.ok(keys.includes("payment_overdue"));
}

{
  const mapped = ownerAttentionInputFromOrder({
    status: "paid",
    confirmationNeedsResend: false,
    fulfilmentMethod: "delivery",
    readyAt: null,
    pickedUpAt: null,
    delivery: {
      deliveryFeeRequest: { status: "pending" },
      processingFeeRequest: { status: "idle" },
    },
  });
  assert.ok(
    deriveOwnerAttention(mapped).some((r) => r.key === "fee_request_pending"),
  );
}

{
  // No attention → empty (workspace should omit block)
  const mapped = ownerAttentionInputFromOrder({
    status: "paid",
    confirmationNeedsResend: false,
    fulfilmentMethod: "pickup",
    readyAt: null,
    pickedUpAt: null,
  });
  assert.equal(deriveOwnerAttention(mapped).length, 0);
}

console.log("Owner Operations attention helpers: PASS");
