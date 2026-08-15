/**
 * Manager Calendar Quick View customer-message parity.
 * Run: npx tsx scripts/test-manager-calendar-messages-parity.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { messageActionsForOperationalState } from "@/engines/orders/message-availability";
import { buildGuestOrderWorkspaceCapabilities } from "@/engines/orders/delivery-finance-capabilities";

const owner = buildGuestOrderWorkspaceCapabilities({
  role: "owner",
  staffId: "owner-1",
});
const manager = buildGuestOrderWorkspaceCapabilities({
  role: "manager",
  staffId: "mgr-1",
});
const vivian = buildGuestOrderWorkspaceCapabilities({
  role: "customer_operations",
  staffId: "vivian-1",
});

assert.equal(manager.canManageOrderMessages, true);
assert.equal(vivian.canManageOrderMessages, true);
assert.equal(owner.canManageOrderMessages, true);

// Owner-only mutations stay Owner-only for Manager.
assert.equal(manager.canUseOwnerBoardTools, false);
assert.equal(manager.canOverrideDiscountEligibility, false);
assert.equal(manager.canOverridePickupMonth, false);
assert.equal(manager.canEnableDeliveryFinance, false);
assert.equal(manager.canExtendPaymentDeadline, false);
assert.equal(manager.canRequestOperationsApproval, false);
assert.equal(manager.canRequestCrossMonthPickupApproval, true);
assert.equal(owner.canOverrideDiscountEligibility, true);
assert.equal(owner.canUseOwnerBoardTools, true);

const calendarPage = readFileSync(
  resolve("src/workspaces/owner/calendar/WholeCakeCalendarPage.tsx"),
  "utf8",
);
assert.match(
  calendarPage,
  /canManageOrderMessages = capabilities\.canManageOrderMessages/,
);
assert.match(
  calendarPage,
  /canOperateOrderActions = capabilities\.canOperateCollectionControls/,
);
assert.match(
  calendarPage,
  /canMutateCalendarOrderActions = capabilities\.role === "owner"/,
);
assert.match(calendarPage, /canMarkReady = capabilities\.role === "owner"/);
assert.match(calendarPage, /canManageOrderMessages=\{canManageOrderMessages\}/);

const quickView = readFileSync(
  resolve("src/workspaces/owner/calendar/CalendarQuickView.tsx"),
  "utf8",
);
assert.match(
  quickView,
  /canManageOrderMessages \? \(\s*<OrderMessagesSection/,
);
assert.doesNotMatch(
  quickView,
  /canMutateCalendarOrderActions \? \(\s*<OrderMessagesSection/,
);
assert.match(
  quickView,
  /canOperateOrderActions \? \(\s*<OrderOperationalControls/,
);

const calendar = readFileSync(
  resolve("src/workspaces/owner/calendar/WholeCakeCalendar.tsx"),
  "utf8",
);
assert.match(calendar, /canManageOrderMessages=\{canManageOrderMessages\}/);

const workspaceForm = readFileSync(
  resolve("src/workspaces/owner/orders/OrderWorkspaceForm.tsx"),
  "utf8",
);
assert.match(
  workspaceForm,
  /capabilities\.canManageOrderMessages \? \(\s*<ViewBlock title="Messages"/,
);
assert.match(
  workspaceForm,
  /capabilities\.canManageOrderMessages \? \(\s*<section[\s\S]*?Messages/,
);

/** Same shared availability engine Owner / Vivian / Manager use in Quick View. */
function customerTitlesFor(state: {
  readyAt: string | null;
  pickedUpAt: string | null;
  outForDeliveryAt?: string | null;
  deliveredAt?: string | null;
  fulfilmentMethod: "pickup" | "delivery";
}): string[] {
  return messageActionsForOperationalState({
    readyAt: state.readyAt,
    pickedUpAt: state.pickedUpAt,
    outForDeliveryAt: state.outForDeliveryAt ?? null,
    deliveredAt: state.deliveredAt ?? null,
    fulfilmentMethod: state.fulfilmentMethod,
    order: {
      customerName: "Amy",
      phone: "012",
      fulfilmentMethod: state.fulfilmentMethod,
      delivery:
        state.fulfilmentMethod === "delivery"
          ? {
              recipientName: "Amy",
              recipientPhone: "012",
              addressLine1: "1 Street",
              addressLine2: null,
              city: "JB",
              postcode: "80000",
              state: "Johor",
              recipientNotifyPreference: "inform_recipient",
              deliveryFeeAmount: 10,
              processingFeeAmount: 0,
              deliveryFeeWaived: false,
              processingFeeWaived: false,
              financeEnabled: true,
              quoteSource: null,
              feeRequest: null,
              processingFeeRequest: null,
            }
          : null,
    },
  })
    .filter((action) => action.type !== "crew")
    .map((action) => action.title);
}

const deliveryReadyTitles = customerTitlesFor({
  readyAt: "2026-08-15T01:00:00.000Z",
  pickedUpAt: null,
  fulfilmentMethod: "delivery",
});
assert.ok(
  deliveryReadyTitles.includes("Delivery Customer Ready"),
  "Ready Delivery exposes Delivery Customer Ready",
);

const outTitles = customerTitlesFor({
  readyAt: "2026-08-15T01:00:00.000Z",
  pickedUpAt: null,
  outForDeliveryAt: "2026-08-15T02:00:00.000Z",
  fulfilmentMethod: "delivery",
});
assert.ok(
  outTitles.some((title) => title.includes("Out for Delivery")),
  "Out for Delivery exposes OFD message",
);
assert.ok(
  outTitles.includes("Customer Thank You Message"),
  "Out for Delivery also keeps Thank You available",
);

const pickupPickedUpTitles = customerTitlesFor({
  readyAt: "2026-08-15T01:00:00.000Z",
  pickedUpAt: "2026-08-15T03:00:00.000Z",
  fulfilmentMethod: "pickup",
});
assert.ok(pickupPickedUpTitles.includes("Customer Thank You Message"));
assert.ok(pickupPickedUpTitles.includes("Customer Ready Message"));

// Roles with canManageOrderMessages all share this availability engine.
for (const role of [manager, vivian, owner]) {
  assert.equal(role.canManageOrderMessages, true);
}

console.log("Manager calendar messages parity: PASS");
