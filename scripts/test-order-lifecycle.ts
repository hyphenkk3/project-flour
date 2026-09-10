/**
 * Phase 8 — Order lifecycle + Customer Operations workflow (static).
 * Run: npx tsx scripts/test-order-lifecycle.ts
 *
 * Engine + source assertions. Does not create or mutate production orders.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  canCancelGuestOrder,
  canCancelGuestOrderRole,
  canCompleteGuestOrder,
  canConfirmGuestPayment,
  canConfirmGuestPaymentRole,
  canDuplicateGuestOrderRole,
  canMarkGuestOrderReady,
  canOverrideCompleteBeforeReadyRole,
  canOverrideUnpaidReadyRole,
  canStartGuestProduction,
  deriveOrderLifecycleStage,
  duplicateOrderResetsLifecycle,
  LIFECYCLE_ERRORS,
  LIFECYCLE_STAGE_LABELS,
  orderLifecycleLabel,
} from "@/engines/orders/lifecycle";
import {
  POST_PAYMENT_CUSTOMER_CHANGE_ERRORS,
  classifyPaidOrderSave,
  decidePostPaymentCancel,
  decidePostPaymentSave,
} from "@/engines/orders/post-payment-customer-change";
import { timelineEventLabel } from "@/engines/orders/timeline";
import {
  matchesOperationsLifecycleFilter,
  matchesOperationsSearch,
  matchesOperationsStatusFilter,
  parseOperationsBoardSearchParams,
  type OperationsBoardOrder,
} from "@/engines/operations/order-board";
import { evaluateCollectionDate } from "@/engines/preorder/validate";
import { buildGuestOrderWorkspaceCapabilities } from "@/engines/orders/delivery-finance-capabilities";
import { buildBakeryWorkspaceCapabilities } from "@/engines/bakery/capabilities";
import { buildCollectionWorkspaceCapabilities } from "@/engines/collection/capabilities";
import {
  isBakeryMarkReadyEligible,
  matchesBakeryQueueFilter,
} from "@/workspaces/bakery/eligibility";
import { matchesCollectionQueueSearch } from "@/workspaces/collection/eligibility";
import { isGuestOrderEditable } from "@/workspaces/owner/orders/labels";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

const pending = {
  status: "awaiting_payment",
  productionStartedAt: null,
  readyAt: null,
  pickedUpAt: null,
  deliveredAt: null,
};

const paid = {
  ...pending,
  status: "paid",
};

const preparing = {
  ...paid,
  productionStartedAt: "2026-09-03T01:00:00.000Z",
};

const ready = {
  ...preparing,
  readyAt: "2026-09-03T03:00:00.000Z",
};

const collected = {
  ...ready,
  pickedUpAt: "2026-09-03T08:00:00.000Z",
};

const cancelled = {
  ...pending,
  status: "cancelled",
};

// 1–6 happy path stages
assert.equal(deriveOrderLifecycleStage(pending), "payment_pending");
assert.equal(orderLifecycleLabel(pending), "Payment Pending");
assert.equal(deriveOrderLifecycleStage(paid), "paid_confirmed");
assert.equal(orderLifecycleLabel(paid), "Paid / Confirmed");
assert.equal(deriveOrderLifecycleStage(preparing), "preparing");
assert.equal(orderLifecycleLabel(preparing), "Preparing");
assert.equal(deriveOrderLifecycleStage(ready), "ready_for_collection");
assert.equal(orderLifecycleLabel(ready), "Ready for Collection");
assert.equal(deriveOrderLifecycleStage(collected), "completed");
assert.equal(orderLifecycleLabel(collected), "Completed / Collected");
assert.equal(LIFECYCLE_STAGE_LABELS.cancelled, "Cancelled");

assert.equal(canStartGuestProduction(paid, "bakery").ok, true, "4 bakery start paid");
assert.equal(canMarkGuestOrderReady({ snapshot: preparing, role: "bakery", surface: "bakery" }).ok, true, "5 bakery ready");
assert.equal(canCompleteGuestOrder({ snapshot: ready, role: "collection", surface: "collection" }).ok, true, "6 collection complete");

// 7 invalid transitions
assert.equal(canStartGuestProduction(cancelled, "bakery").ok, false);
assert.equal(canStartGuestProduction(collected, "bakery").ok, false);
assert.equal(canStartGuestProduction(ready, "bakery").ok, false);
assert.equal(
  canMarkGuestOrderReady({ snapshot: cancelled, role: "bakery", surface: "bakery" }).ok,
  false,
);
assert.equal(
  canMarkGuestOrderReady({ snapshot: collected, role: "bakery", surface: "bakery" }).ok,
  false,
);

// 8–10 cancelled retained / cannot resume / cannot pay
assert.equal(deriveOrderLifecycleStage(cancelled), "cancelled");
assert.equal(isGuestOrderEditable("cancelled"), false);
assert.equal(canStartGuestProduction(cancelled, "bakery").ok, false);
assert.equal(canStartGuestProduction(collected, "bakery").ok, false);
assert.equal(canStartGuestProduction(ready, "bakery").ok, false);
assert.equal(canConfirmGuestPayment(cancelled, "customer_operations").ok, false);
{
  const payCancel = canConfirmGuestPayment(
    cancelled,
    "customer_operations",
  );
  assert.equal(payCancel.ok, false);
  if (!payCancel.ok) {
    assert.equal(payCancel.error, LIFECYCLE_ERRORS.cancelledPayment);
  }
}

// 11 unpaid cannot become Ready (Bakery)
assert.equal(
  canMarkGuestOrderReady({
    snapshot: { ...preparing, status: "awaiting_payment" },
    role: "bakery",
    surface: "bakery",
  }).ok,
  false,
);
assert.equal(
  isBakeryMarkReadyEligible({
    productionStartedAt: "t",
    readyAt: null,
    status: "awaiting_payment",
  }),
  false,
);
assert.equal(
  canMarkGuestOrderReady({
    snapshot: { ...preparing, status: "awaiting_payment" },
    role: "owner",
    surface: "owner",
  }).ok,
  true,
  "Owner may override unpaid Ready",
);

// 12 Collection complete appropriate order
assert.equal(
  canCompleteGuestOrder({
    snapshot: preparing,
    role: "collection",
    surface: "collection",
  }).ok,
  false,
);

// 13 Bakery cannot perform CO-only mutations
assert.equal(canCancelGuestOrderRole("bakery"), false);
assert.equal(canDuplicateGuestOrderRole("bakery"), false);
assert.equal(canConfirmGuestPaymentRole("bakery"), false);
assert.equal(
  buildGuestOrderWorkspaceCapabilities({ role: "bakery", staffId: "b1" })
    .canRecordPayment,
  false,
);
assert.equal(
  buildBakeryWorkspaceCapabilities({ role: "bakery", staffId: "b1" })
    .canStartProduction,
  true,
);

// 14 CO assigned customer operations
const co = buildGuestOrderWorkspaceCapabilities({
  role: "customer_operations",
  staffId: "co1",
});
assert.equal(co.canRecordPayment, true);
assert.equal(co.canCancelGuestOrder, true);
assert.equal(co.canDuplicateGuestOrder, true);
assert.equal(co.canEditOrderWorkspace, true);
assert.equal(co.canOverrideUnpaidReady, false);
assert.equal(co.canOverridePostPaymentCustomerChange, false);
assert.equal(
  canCompleteGuestOrder({
    snapshot: preparing,
    role: "customer_operations",
    surface: "ops",
  }).ok,
  false,
  "CO cannot complete before Ready",
);

// 15 Manager/Owner override
assert.equal(canOverrideUnpaidReadyRole("owner"), true);
assert.equal(canOverrideUnpaidReadyRole("manager"), true);
assert.equal(
  buildGuestOrderWorkspaceCapabilities({ role: "owner", staffId: "o1" })
    .canOverridePostPaymentCustomerChange,
  true,
);
assert.equal(
  buildGuestOrderWorkspaceCapabilities({ role: "manager", staffId: "m1" })
    .canOverridePostPaymentCustomerChange,
  true,
);
assert.equal(
  buildGuestOrderWorkspaceCapabilities({ role: "bakery", staffId: "b1" })
    .canOverridePostPaymentCustomerChange,
  false,
);
assert.equal(canOverrideCompleteBeforeReadyRole("owner"), true);
assert.equal(
  canCompleteGuestOrder({
    snapshot: paid,
    role: "owner",
    surface: "ops",
  }).ok,
  true,
);
assert.equal(
  canCancelGuestOrder({ snapshot: collected, role: "customer_operations" }).ok,
  false,
);
assert.equal(
  canCancelGuestOrder({ snapshot: collected, role: "owner" }).ok,
  true,
);

// 16 Collection permissions
const collectionCaps = buildCollectionWorkspaceCapabilities({
  role: "collection",
  staffId: "c1",
});
assert.equal(collectionCaps.canMarkCollected, true);
assert.equal(canCancelGuestOrderRole("collection"), false);
assert.equal(canConfirmGuestPaymentRole("collection"), false);

// 17–19 duplicate resets lifecycle / current price / date validation
const reset = duplicateOrderResetsLifecycle();
assert.equal(reset.status, "submitted");
assert.equal(reset.paymentStatus, "unpaid");
assert.equal(reset.productionStartedAt, null);
assert.equal(reset.readyAt, null);
assert.equal(reset.pickedUpAt, null);
const actionsSrc = read("src/workspaces/owner/orders/actions.ts");
assert.match(actionsSrc, /duplicateGuestOrderAction/);
assert.match(actionsSrc, /create_staff_guest_preorder/);
assert.match(actionsSrc, /assertStaffCollectionDateAllowed/);
assert.match(actionsSrc, /p_internal_notes: null/);
assert.doesNotMatch(actionsSrc, /p_payment_status/);
const createSql = read(
  "supabase/migrations/20260810120000_m4_p2_fulfilment_delivery_details.sql",
);
assert.match(createSql, /'submitted'/);
assert.match(createSql, /'unpaid'/);
assert.match(createSql, /unit_price/);

const dateEval = evaluateCollectionDate({
  selectedYmd: "2026-09-01",
  businessDate: "2026-09-03",
  lines: [
    {
      lineId: "a::s",
      cakeId: "a",
      cakeSizeId: "s",
      cakeName: "Cake",
      sizeLabel: "6",
      quantity: 1,
      preorderDays: 2,
    },
  ],
  operatingOpen: true,
  closed: false,
  inCatalogue: true,
});
assert.equal(dateEval.valid, false);
assert.equal(dateEval.reason.code, "before_preorder");

// 20 waiting-list converted order enters normal lifecycle
const waitingSql = read(
  "supabase/migrations/20260903120000_waiting_list_engine.sql",
);
assert.match(waitingSql, /waiting_list_convert_item/);
assert.match(waitingSql, /create_staff_guest_preorder/);
assert.match(waitingSql, /converted_order_id/);

// 21–22 timeline + actor
const cancelSql = read(
  "supabase/migrations/20260903140000_phase8_guest_order_cancel.sql",
);
assert.match(cancelSql, /order_cancelled/);
assert.match(cancelSql, /actor_staff_id/);
assert.match(cancelSql, /for update/i);
assert.match(actionsSrc, /order_duplicated/);
assert.match(actionsSrc, /actorStaffId: staff.id/);

// 23 date changes still validate availability
assert.match(actionsSrc, /pickupDate !== before.pickupDate/);
assert.match(
  read("src/workspaces/owner/orders/collection-date-guard.ts"),
  /evaluateCollectionDate/,
);

// 24 post-payment one-time customer change is enforced
const phase2Sql = read(
  "supabase/migrations/20260902120000_phase2_ordering_foundation.sql",
);
assert.match(phase2Sql, /post_payment_customer_change/);
const postPaymentSql = read(
  "supabase/migrations/20260910120000_post_payment_customer_change_guard.sql",
);
assert.match(postPaymentSql, /guard_post_payment_customer_change/);
assert.match(postPaymentSql, /for update/i);
assert.match(postPaymentSql, /post_payment_customer_change_count = 1/);
assert.match(postPaymentSql, /post_payment_change_override_at/);
assert.match(postPaymentSql, /post_payment_change_override_by/);
assert.match(postPaymentSql, /p_override boolean default false/);
assert.match(actionsSrc, /guard_post_payment_customer_change/);
assert.match(actionsSrc, /post_payment_change_override/);
assert.match(actionsSrc, /decidePostPaymentSave/);
assert.match(actionsSrc, /decidePostPaymentCancel/);
assert.match(actionsSrc, /p_override: override/);
assert.match(actionsSrc, /unitPrice: prior \? prior.unitPrice : size.price/);
assert.match(
  actionsSrc,
  /classification.newCakeLineAdded/,
);

const workspaceSrc = read(
  "src/workspaces/owner/orders/OrderWorkspaceForm.tsx",
);
assert.match(workspaceSrc, /one-time post-payment customer change has been used/);
assert.match(workspaceSrc, /post_payment_change_override/);
assert.match(
  workspaceSrc,
  /canOverridePostPaymentCustomerChange/,
);

const lifecycleActionsSrc = read(
  "src/workspaces/owner/orders/OrderLifecycleActions.tsx",
);
assert.match(lifecycleActionsSrc, /cancelGuestOrderAction\(/);
assert.match(lifecycleActionsSrc, /cancelOverride/);

assert.equal(
  timelineEventLabel("post_payment_customer_change"),
  "Post-payment customer change",
);
assert.equal(
  timelineEventLabel("post_payment_customer_change_override"),
  "Post-payment change override",
);

const paidBefore = {
  customerName: "Amy",
  phone: "012",
  email: "",
  pickupDate: "2026-09-20",
  pickupTime: "15:00:00",
  notes: null,
  fulfilmentMethod: "pickup" as const,
  delivery: null,
  items: [
    {
      cakeId: "c1",
      cakeSizeId: "s8",
      quantity: 1,
    },
  ],
  complimentaryItems: [],
  paidAddons: [],
};

function proposedFrom(patch: {
  pickupDate?: string;
  pickupTime?: string;
  items?: Array<{ cakeId: string; cakeSizeId: string; quantity: number }>;
}) {
  return {
    guestName: "Amy",
    guestPhone: "012",
    guestEmail: "",
    pickupDate: patch.pickupDate ?? "2026-09-20",
    pickupTime: patch.pickupTime ?? "15:00:00",
    customerNotes: "",
    fulfilmentMethod: "pickup",
    deliveryKey: "",
    items: patch.items ?? [{ cakeId: "c1", cakeSizeId: "s8", quantity: 1 }],
    complimentary: [],
    paidAddons: [],
  };
}

const unpaidDecision = decidePostPaymentSave({
  status: "awaiting_payment",
  changeCount: 0,
  role: "customer_operations",
  override: false,
  classification: classifyPaidOrderSave(
    paidBefore,
    proposedFrom({ pickupDate: "2026-09-21" }),
  ),
});
assert.equal(unpaidDecision.action, "allow_unpaid");

const firstChange = classifyPaidOrderSave(
  paidBefore,
  proposedFrom({ pickupDate: "2026-09-21" }),
);
assert.equal(firstChange.pickupOrFulfilmentChanged, true);
assert.equal(firstChange.existingCakeLineAltered, false);
assert.equal(
  decidePostPaymentSave({
    status: "paid",
    changeCount: 0,
    role: "customer_operations",
    override: false,
    classification: firstChange,
  }).action,
  "consume",
);

const secondChange = decidePostPaymentSave({
  status: "paid",
  changeCount: 1,
  role: "customer_operations",
  override: false,
  classification: firstChange,
});
assert.equal(secondChange.action, "block_used");
if (secondChange.action === "block_used") {
  assert.equal(secondChange.error, POST_PAYMENT_CUSTOMER_CHANGE_ERRORS.used);
}

const ownerSecond = decidePostPaymentSave({
  status: "paid",
  changeCount: 1,
  role: "owner",
  override: true,
  classification: firstChange,
});
assert.equal(ownerSecond.action, "override");

const bakeryOverride = decidePostPaymentSave({
  status: "paid",
  changeCount: 1,
  role: "bakery",
  override: true,
  classification: firstChange,
});
assert.equal(bakeryOverride.action, "block_override_role");

const cakeEdit = classifyPaidOrderSave(
  paidBefore,
  proposedFrom({
    items: [{ cakeId: "c1", cakeSizeId: "s8", quantity: 2 }],
  }),
);
assert.equal(cakeEdit.existingCakeLineAltered, true);
assert.equal(
  decidePostPaymentSave({
    status: "paid",
    changeCount: 0,
    role: "customer_operations",
    override: false,
    classification: cakeEdit,
  }).action,
  "block_cake_line",
);

const addCake = classifyPaidOrderSave(
  paidBefore,
  proposedFrom({
    items: [
      { cakeId: "c1", cakeSizeId: "s8", quantity: 1 },
      { cakeId: "c1", cakeSizeId: "s4", quantity: 1 },
    ],
  }),
);
assert.equal(addCake.newCakeLineAdded, true);
assert.equal(addCake.existingCakeLineAltered, false);
assert.equal(
  decidePostPaymentSave({
    status: "paid",
    changeCount: 0,
    role: "customer_operations",
    override: false,
    classification: addCake,
  }).action,
  "consume",
);

const staffOnly = classifyPaidOrderSave(paidBefore, proposedFrom({}));
assert.equal(staffOnly.customerFacingChange, false);
assert.equal(
  decidePostPaymentSave({
    status: "paid",
    changeCount: 1,
    role: "customer_operations",
    override: false,
    classification: staffOnly,
  }).action,
  "allow_staff_only",
);

assert.equal(
  decidePostPaymentCancel({
    status: "paid",
    changeCount: 0,
    role: "customer_operations",
    override: false,
  }).ok,
  true,
);
assert.equal(
  decidePostPaymentCancel({
    status: "paid",
    changeCount: 1,
    role: "customer_operations",
    override: false,
  }).ok,
  false,
);
assert.equal(
  decidePostPaymentCancel({
    status: "paid",
    changeCount: 1,
    role: "owner",
    override: true,
  }).ok,
  true,
);
assert.equal(
  decidePostPaymentCancel({
    status: "awaiting_payment",
    changeCount: 0,
    role: "customer_operations",
    override: false,
  }).ok,
  true,
);

// 25–26 preorder exception / customer informed remain in SQL (not redesigned)
const exceptionSql = read(
  "supabase/migrations/20260902120000_phase2_ordering_foundation.sql",
);
assert.match(exceptionSql, /mark_preorder_exception_customer_informed/);
assert.match(exceptionSql, /customer_informed_at/);
assert.match(actionsSrc, /assertStaffCollectionDateAllowed/);
assert.match(actionsSrc, /collectionId: before\.collectionId,\s*orderId,/);
assert.match(
  read("src/workspaces/owner/approvals/actions.ts"),
  /mark_preorder_exception_customer_informed/,
);
assert.match(
  read("src/workspaces/owner/approvals/actions.ts"),
  /create_preorder_lead_time_exception_request/,
);
assert.match(
  read("src/workspaces/owner/approvals/actions.ts"),
  /withdraw_preorder_lead_time_exception/,
);
assert.match(
  read("src/workspaces/owner/approvals/actions.ts"),
  /correct_preorder_exception_customer_informed/,
);
assert.match(
  read("src/workspaces/owner/orders/collection-date-guard.ts"),
  /before_preorder/,
);
const dateGuardIdx = actionsSrc.indexOf("export async function saveOrderWorkspaceAction");
const saveBody = actionsSrc.slice(dateGuardIdx);
const firstDateGuard = saveBody.indexOf("assertStaffCollectionDateAllowed");
const postPay = saveBody.indexOf("decidePostPaymentSave");
assert.ok(firstDateGuard > -1 && postPay > firstDateGuard);
assert.ok(saveBody.indexOf("guard_post_payment_customer_change") > postPay);

// 27 search by reference / customer / date / status / lifecycle
const searchOrder: OperationsBoardOrder = {
  id: "1",
  orderNumber: "ORD-20260903-0001",
  customerName: "Amy Tan",
  phone: "0123456789",
  pickupDate: "2026-09-03",
  pickupTime: "14:00",
  status: "paid",
  createdAt: "2026-09-01T00:00:00.000Z",
  productionStartedAt: "t",
  readyAt: null,
  pickedUpAt: null,
  deliveredAt: null,
};
assert.equal(matchesOperationsSearch(searchOrder, "ORD-20260903-0001"), true);
assert.equal(matchesOperationsSearch(searchOrder, "Amy"), true);
assert.equal(matchesOperationsSearch(searchOrder, "5678"), true);
assert.equal(matchesOperationsStatusFilter(searchOrder, "paid"), true);
assert.equal(
  matchesOperationsLifecycleFilter(searchOrder, "preparing"),
  true,
);
assert.equal(
  parseOperationsBoardSearchParams({ lifecycle: "ready_for_collection" })
    .lifecycleFilter,
  "ready_for_collection",
);

const cancelledRow: OperationsBoardOrder = {
  ...searchOrder,
  status: "cancelled",
  productionStartedAt: null,
};
assert.equal(matchesOperationsStatusFilter(cancelledRow, "cancelled"), true);
assert.equal(
  matchesOperationsLifecycleFilter(cancelledRow, "cancelled"),
  true,
);

// 28 Bakery queue filtering
assert.equal(
  matchesBakeryQueueFilter(
    { status: "paid", productionStartedAt: null, readyAt: null },
    "awaiting_prep",
  ),
  true,
);
assert.equal(
  matchesBakeryQueueFilter(
    { status: "awaiting_payment", productionStartedAt: null, readyAt: null },
    "not_ready",
  ),
  true,
);
assert.equal(
  matchesBakeryQueueFilter(
    { status: "paid", productionStartedAt: "t", readyAt: null },
    "preparing",
  ),
  true,
);
assert.equal(
  matchesBakeryQueueFilter(
    { status: "paid", productionStartedAt: "t", readyAt: "r" },
    "ready",
  ),
  true,
);

// 29 Collection queue filtering
assert.equal(
  matchesCollectionQueueSearch(
    { orderNumber: "ORD-1", guestName: "Ben", guestPhone: "0191112222" },
    "Ben",
  ),
  true,
);
assert.equal(
  matchesCollectionQueueSearch(
    { orderNumber: "ORD-1", guestName: "Ben", guestPhone: "0191112222" },
    "ORD-1",
  ),
  true,
);

// 30 Fresh Picks remains separate
assert.doesNotMatch(actionsSrc, /extra_stock_id/);
assert.match(
  read("src/workspaces/storefront/extra/actions.ts"),
  /submitGuestExtraOrder|extra/,
);

// 31 waiting-list master remains
assert.match(
  read("src/workspaces/waiting-list/actions.ts"),
  /waiting_list_convert_item/,
);

// 32 production capacity unchanged by Phase 8
assert.doesNotMatch(
  read("supabase/migrations/20260903140000_phase8_guest_order_cancel.sql"),
  /production_capacity/,
);

// 33 Customer Fully Booked remains in preorder validate
assert.match(
  read("src/engines/preorder/validate.ts"),
  /FULLY_BOOKED_CUSTOMER_LABEL/,
);

// Payment pending until confirmed; submit does not mark paid
assert.match(
  read("src/workspaces/storefront/checkout/actions.ts"),
  /submit_guest_preorder|submitGuestPreorder/,
);
assert.equal(canConfirmGuestPayment(pending, "customer_operations").ok, true);
assert.equal(canConfirmGuestPayment(paid, "customer_operations").ok, false);

// Unpaid start remains Bakery exception
assert.equal(
  canStartGuestProduction({ ...pending, status: "awaiting_payment" }, "bakery")
    .ok,
  true,
);
assert.equal(
  canStartGuestProduction({ ...pending, status: "submitted" }, "bakery").ok,
  false,
);

console.log("PASS order lifecycle (phase 8 static)");
