/**
 * Guest preorder notification preference + eligibility tests.
 * Run: npx tsx scripts/test-guest-preorder-notification-preference.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  STAFF_NOTIFICATION_DEFAULT_ENABLED,
  STAFF_NOTIFICATION_DEFAULT_WEB_MODE,
  STAFF_NOTIFICATION_DEFINITIONS,
  type StaffNotificationPreference,
} from "../src/foundation/staff/notification-preferences";
import {
  buildGuestPreorderNotificationToast,
  guestPreorderNotificationAlreadyNotified,
  guestPreorderNotificationDurationMs,
  GUEST_PREORDER_NOTIFIED_IDS_KEY,
  isGuestWholeCakeSubmittedPreorder,
  isGuestWholeCakeSubmittedPreorderLiveRow,
  markGuestPreorderNotificationsSeen,
  tryClaimGuestPreorderNotification,
} from "../src/workspaces/owner/orders/guest-preorder-notifications";
import type { StorefrontOrderListItem } from "../src/types/storefront";

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
    readyAt: null,
    pickedUpAt: null,
    outForDeliveryAt: null,
    deliveredAt: null,
    paymentDeadlineAt: null,
    hasPendingFeeRequest: false,
    ...overrides,
  };
}

// --- Preference ---

assert.equal(STAFF_NOTIFICATION_DEFAULT_ENABLED, true);
assert.equal(STAFF_NOTIFICATION_DEFAULT_WEB_MODE, "transient");

const guestPreorderDefinition = STAFF_NOTIFICATION_DEFINITIONS.find(
  (definition) => definition.code === "guest_preorder",
);

assert.ok(guestPreorderDefinition);
assert.equal(guestPreorderDefinition.label, "Guest preorder");
assert.equal(
  guestPreorderDefinition.description,
  "When a guest preorder is submitted.",
);

const transientPreference: StaffNotificationPreference = {
  code: "guest_preorder",
  webEnabled: true,
  webMode: "transient",
  emailEnabled: false,
};

const persistentPreference: StaffNotificationPreference = {
  ...transientPreference,
  webMode: "persistent",
};

const disabledPreference: StaffNotificationPreference = {
  ...transientPreference,
  webEnabled: false,
};

assert.equal(transientPreference.webEnabled, true);
assert.equal(transientPreference.webMode, "transient");
assert.equal(persistentPreference.webMode, "persistent");
assert.equal(disabledPreference.webEnabled, false);

{
  // Notification preference is now supplied server-side rather than
  // persisted/read from browser localStorage.
  const homePageSrc = readFileSync(
    resolve("src/app/(app)/home/page.tsx"),
    "utf8",
  );
  assert.match(homePageSrc, /loadStaffNotificationPreferences/);
  assert.match(homePageSrc, /code === "guest_preorder"/);
  assert.match(homePageSrc, /notificationPreference=\{notificationPreference\}/);

  const homeCockpitSrc = readFileSync(
    resolve("src/workspaces/home/HomeCockpit.tsx"),
    "utf8",
  );
  assert.match(homeCockpitSrc, /StaffNotificationPreference/);
  assert.match(homeCockpitSrc, /notificationPreference/);
  assert.match(
    homeCockpitSrc,
    /HomeGuestPreorderNotificationListener/,
  );

  const homeListenerSrc = readFileSync(
    resolve("src/workspaces/home/HomeGuestPreorderNotificationListener.tsx"),
    "utf8",
  );
  assert.match(homeListenerSrc, /StaffNotificationPreference/);
  assert.match(homeListenerSrc, /notificationPreference\.webEnabled/);
  assert.match(homeListenerSrc, /notificationPreference\.webMode/);
  assert.doesNotMatch(
    homeListenerSrc,
    /readGuestPreorderNotificationPreference/,
  );
}

{
  // Operations board receives the same server-loaded preference.
  const ownerDashboardSrc = readFileSync(
    resolve("src/workspaces/owner/OwnerDashboard.tsx"),
    "utf8",
  );
  assert.match(ownerDashboardSrc, /loadStaffNotificationPreferences/);
  assert.match(ownerDashboardSrc, /code === "guest_preorder"/);
  assert.match(ownerDashboardSrc, /notificationPreference=\{notificationPreference\}/);

  const operationsSrc = readFileSync(
    resolve("src/workspaces/owner/OperationsLiveBoard.tsx"),
    "utf8",
  );
  assert.match(operationsSrc, /StaffNotificationPreference/);
  assert.match(operationsSrc, /notificationPreference\.webEnabled/);
  assert.match(operationsSrc, /notificationPreference\.webMode/);
  assert.doesNotMatch(
    operationsSrc,
    /readGuestPreorderNotificationPreference/,
  );
}

assert.equal(guestPreorderNotificationDurationMs("transient"), 4500);
assert.equal(guestPreorderNotificationDurationMs("persistent"), null);

const transientToast = buildGuestPreorderNotificationToast(
  sampleOrder(),
  "transient",
  "/owner",
);
assert.ok(transientToast);
assert.equal(transientToast.durationMs, 4500);
assert.equal(transientToast.actionHref, undefined);

const persistentToast = buildGuestPreorderNotificationToast(
  sampleOrder(),
  "persistent",
  "/owner",
);
assert.ok(persistentToast);
assert.equal(persistentToast.durationMs, null);
assert.match(persistentToast.actionHref ?? "", /\/owner\/orders\/order-1/);
assert.equal(persistentToast.actionLabel, "View order");

// --- Eligibility ---

assert.equal(isGuestWholeCakeSubmittedPreorder(sampleOrder()), true);

assert.equal(
  isGuestWholeCakeSubmittedPreorder(
    sampleOrder({ status: "pending_confirmation" }),
  ),
  false,
);
assert.equal(
  isGuestWholeCakeSubmittedPreorder(
    sampleOrder({ status: "awaiting_payment" }),
  ),
  false,
);
assert.equal(
  isGuestWholeCakeSubmittedPreorder(sampleOrder({ status: "paid" })),
  false,
);
assert.equal(
  isGuestWholeCakeSubmittedPreorder(
    sampleOrder({ extraStockId: "extra-1" }),
  ),
  false,
);
assert.equal(
  isGuestWholeCakeSubmittedPreorder(
    sampleOrder({ orderSource: "whatsapp" }),
  ),
  false,
);
assert.equal(
  isGuestWholeCakeSubmittedPreorder(
    sampleOrder({ orderSource: "walk_in" }),
  ),
  false,
);
assert.equal(
  isGuestWholeCakeSubmittedPreorder(sampleOrder({ crewOrder: true })),
  false,
);

assert.equal(
  isGuestWholeCakeSubmittedPreorderLiveRow({
    id: "live-1",
    customer_id: null,
    status: "submitted",
    extra_stock_id: null,
    order_source: "customer_website",
    crew_order: false,
  }),
  true,
);
assert.equal(
  isGuestWholeCakeSubmittedPreorderLiveRow({
    id: "live-2",
    customer_id: null,
    status: "submitted",
    extra_stock_id: "extra-1",
    order_source: "customer_website",
  }),
  false,
);

// --- Browser-local notification dedup (jsdom-less) ---

if (typeof globalThis.localStorage !== "undefined") {
  const priorNotified = localStorage.getItem(GUEST_PREORDER_NOTIFIED_IDS_KEY);

  try {
    localStorage.removeItem(GUEST_PREORDER_NOTIFIED_IDS_KEY);
    markGuestPreorderNotificationsSeen(["seed-a", "seed-b"]);
    assert.equal(guestPreorderNotificationAlreadyNotified("seed-a"), true);
    assert.equal(tryClaimGuestPreorderNotification("seed-a"), false);
    assert.equal(tryClaimGuestPreorderNotification("seed-c"), true);
    assert.equal(tryClaimGuestPreorderNotification("seed-c"), false);
  } finally {
    if (priorNotified == null) {
      localStorage.removeItem(GUEST_PREORDER_NOTIFIED_IDS_KEY);
    } else {
      localStorage.setItem(GUEST_PREORDER_NOTIFIED_IDS_KEY, priorNotified);
    }
  }
}

// --- Live refresh regression (source contracts) ---

const homeLiveSrc = readFileSync(
  resolve("src/workspaces/home/HomeLiveRefresh.tsx"),
  "utf8",
);
assert.match(homeLiveSrc, /postgres_changes/);
assert.match(homeLiveSrc, /router\.refresh/);
assert.match(homeLiveSrc, /GUEST_ORDERS_LIVE_POLL_MS/);
assert.doesNotMatch(homeLiveSrc, /readGuestPreorderNotificationPreference/);

const homeListenerSrc = readFileSync(
  resolve("src/workspaces/home/HomeGuestPreorderNotificationListener.tsx"),
  "utf8",
);
assert.match(homeListenerSrc, /postgres_changes/);
assert.match(homeListenerSrc, /GUEST_ORDERS_LIVE_POLL_MS/);
assert.doesNotMatch(homeListenerSrc, /router\.refresh/);

const operationsSrc = readFileSync(
  resolve("src/workspaces/owner/OperationsLiveBoard.tsx"),
  "utf8",
);
assert.match(operationsSrc, /postgres_changes/);
assert.match(operationsSrc, /GUEST_ORDERS_LIVE_POLL_MS/);
assert.doesNotMatch(operationsSrc, /readGuestPreorderNotificationPreference/);
assert.match(operationsSrc, /isGuestWholeCakeSubmittedPreorder/);
assert.doesNotMatch(
  operationsSrc,
  /if \(isNew\)[\s\S]*notifyNewOrder/,
);

const toastSrc = readFileSync(resolve("src/components/ui/Toast.tsx"), "utf8");
assert.match(toastSrc, /durationMs != null/);
assert.match(toastSrc, /actionHref/);

const userMenuSrc = readFileSync(
  resolve("src/components/shell/UserMenu.tsx"),
  "utf8",
);

// UserMenu no longer owns guest-preorder notification preferences.
// Preferences are loaded server-side and passed to the relevant workspace.
assert.doesNotMatch(userMenuSrc, /guest-preorder-notification/);
assert.doesNotMatch(userMenuSrc, /Persistent/);

console.log("PASS guest preorder notification preference");
