/**
 * Guest preorder notification preference + eligibility tests.
 * Run: npx tsx scripts/test-guest-preorder-notification-preference.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  GUEST_PREORDER_NOTIFICATION_DEFAULT,
  guestPreorderNotificationStorageKey,
  parseGuestPreorderNotificationPreference,
} from "../src/foundation/staff/guest-preorder-notification-preference";
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

assert.equal(GUEST_PREORDER_NOTIFICATION_DEFAULT, "transient");
assert.equal(parseGuestPreorderNotificationPreference(null), "transient");
assert.equal(parseGuestPreorderNotificationPreference("off"), "off");
assert.equal(parseGuestPreorderNotificationPreference("persistent"), "persistent");
assert.equal(
  guestPreorderNotificationStorageKey("staff-abc"),
  "wos:guest-preorder-notification:staff-abc",
);

assert.equal(guestPreorderNotificationDurationMs("transient"), 4500);
assert.equal(guestPreorderNotificationDurationMs("persistent"), null);

const offToast = buildGuestPreorderNotificationToast(
  sampleOrder(),
  "off",
  "/owner",
);
assert.equal(offToast, null);

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

// --- Browser-local dedup (jsdom-less: exercise storage when available) ---

if (typeof globalThis.localStorage !== "undefined") {
  const priorNotified = localStorage.getItem(GUEST_PREORDER_NOTIFIED_IDS_KEY);
  const priorPref = localStorage.getItem(
    guestPreorderNotificationStorageKey("staff-test"),
  );

  try {
    localStorage.removeItem(GUEST_PREORDER_NOTIFIED_IDS_KEY);
    markGuestPreorderNotificationsSeen(["seed-a", "seed-b"]);
    assert.equal(guestPreorderNotificationAlreadyNotified("seed-a"), true);
    assert.equal(tryClaimGuestPreorderNotification("seed-a"), false);
    assert.equal(tryClaimGuestPreorderNotification("seed-c"), true);
    assert.equal(tryClaimGuestPreorderNotification("seed-c"), false);

    localStorage.setItem(
      guestPreorderNotificationStorageKey("staff-test"),
      "persistent",
    );
    assert.equal(
      parseGuestPreorderNotificationPreference(
        localStorage.getItem(guestPreorderNotificationStorageKey("staff-test")),
      ),
      "persistent",
    );
  } finally {
    if (priorNotified == null) {
      localStorage.removeItem(GUEST_PREORDER_NOTIFIED_IDS_KEY);
    } else {
      localStorage.setItem(GUEST_PREORDER_NOTIFIED_IDS_KEY, priorNotified);
    }
    if (priorPref == null) {
      localStorage.removeItem(guestPreorderNotificationStorageKey("staff-test"));
    } else {
      localStorage.setItem(
        guestPreorderNotificationStorageKey("staff-test"),
        priorPref,
      );
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
assert.match(operationsSrc, /readGuestPreorderNotificationPreference/);
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
assert.match(userMenuSrc, /guest-preorder-notification/);
assert.match(userMenuSrc, /Persistent/);

console.log("PASS guest preorder notification preference");
