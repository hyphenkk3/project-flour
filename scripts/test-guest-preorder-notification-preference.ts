/**
 * Legacy Guest Preorder Alerts must stay retired.
 * The seven-category staff notification system is the only path.
 * Run: npx tsx scripts/test-guest-preorder-notification-preference.ts
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  STAFF_NOTIFICATION_DEFINITIONS,
} from "../src/foundation/staff/notification-preferences";
import { isNewOrderNotificationEligible } from "../src/workspaces/owner/orders/new-order-notifications";
import type { StorefrontOrderListItem } from "../src/types/storefront";

function read(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

assert.equal(
  STAFF_NOTIFICATION_DEFINITIONS.some(
    (definition) => definition.code === "guest_preorder",
  ),
  false,
);

assert.equal(
  existsSync(
    resolve("src/workspaces/home/HomeGuestPreorderNotificationListener.tsx"),
  ),
  false,
);
assert.equal(
  existsSync(
    resolve("src/workspaces/owner/orders/guest-preorder-notifications.ts"),
  ),
  false,
);

const userMenuSrc = read("src/components/shell/UserMenu.tsx");
assert.doesNotMatch(userMenuSrc, /Guest Preorder/);
assert.doesNotMatch(userMenuSrc, /guest-preorder-notification/);
assert.doesNotMatch(userMenuSrc, /localStorage/);

const homePageSrc = read("src/app/(app)/home/page.tsx");
assert.doesNotMatch(homePageSrc, /guest_preorder/);
assert.doesNotMatch(homePageSrc, /notificationPreference/);
assert.doesNotMatch(homePageSrc, /HomeGuestPreorderNotificationListener/);

const homeCockpitSrc = read("src/workspaces/home/HomeCockpit.tsx");
assert.doesNotMatch(homeCockpitSrc, /notificationPreference/);
assert.doesNotMatch(homeCockpitSrc, /HomeGuestPreorderNotificationListener/);

const ownerDashboardSrc = read("src/workspaces/owner/OwnerDashboard.tsx");
assert.doesNotMatch(ownerDashboardSrc, /guest_preorder/);
assert.doesNotMatch(ownerDashboardSrc, /notificationPreference/);

const operationsSrc = read("src/workspaces/owner/OperationsLiveBoard.tsx");
assert.doesNotMatch(operationsSrc, /Guest Preorder/);
assert.doesNotMatch(operationsSrc, /tryClaimNewOrderNotification/);
assert.doesNotMatch(operationsSrc, /buildNewOrderNotificationToast/);
assert.doesNotMatch(operationsSrc, /NEW_ORDER_NOTIFIED_IDS_KEY/);
assert.match(operationsSrc, /postgres_changes/);

const listenerSrc = read("src/components/shell/StaffNotificationListener.tsx");
assert.match(listenerSrc, /staff_notification_events/);
assert.doesNotMatch(listenerSrc, /guest_preorder/);

function sampleOrder(
  overrides: Partial<StorefrontOrderListItem> = {},
): StorefrontOrderListItem {
  return {
    id: "order-1",
    orderNumber: "WB-100",
    customerName: "Guest",
    phone: "91234567",
    cakeName: "Mangolicious",
    sizeLabel: "6",
    additionalItemCount: 0,
    pickupDate: "2026-09-18",
    pickupTime: "14:00",
    status: "submitted",
    createdAt: "2026-08-20T00:00:00.000Z",
    confirmationNeedsResend: false,
    orderSource: "customer_website",
    crewOrder: false,
    extraStockId: null,
    fulfilmentMethod: "pickup",
    productionStartedAt: null,
    readyAt: null,
    pickedUpAt: null,
    outForDeliveryAt: null,
    deliveredAt: null,
    paymentDeadlineAt: null,
    hasPendingFeeRequest: false,
    ...overrides,
  };
}

assert.equal(isNewOrderNotificationEligible(sampleOrder()), true);
assert.equal(
  isNewOrderNotificationEligible(sampleOrder({ extraStockId: "extra-1" })),
  false,
);

console.log("PASS guest preorder notification preference");
