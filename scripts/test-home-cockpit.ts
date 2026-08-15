/**
 * Home v1 cockpit — source + pure model tests.
 * Run: npx tsx scripts/test-home-cockpit.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getNavigationForRole } from "@/foundation/navigation/workspaces";
import { canAccessOperationsBoard } from "@/engines/orders/delivery-finance-capabilities";
import { canAccessCollectionWorkspace } from "@/engines/collection/capabilities";
import { canAccessBakeryWorkspace } from "@/engines/bakery/capabilities";
import {
  buildHomeCockpitModel,
  homeQuickLinksFromNavigation,
} from "@/workspaces/home/cockpit-model";
import { homePendingApprovalsHref } from "@/engines/operations/approval-ux";
import { canAccessOperationsApprovalsInbox } from "@/engines/operations/approvals";
import type { StorefrontOrderListItem } from "@/types/storefront";
import type { CollectionBoardOrder } from "@/workspaces/collection/types";
import type { BakeryBoardOrder } from "@/workspaces/bakery/types";

function listItem(
  partial: Partial<StorefrontOrderListItem> &
    Pick<StorefrontOrderListItem, "id" | "pickupDate" | "status">,
): StorefrontOrderListItem {
  return {
    orderNumber: "WB-1",
    customerName: "Amy",
    phone: "012",
    cakeName: "Cake",
    sizeLabel: '6"',
    additionalItemCount: 0,
    pickupTime: "15:00:00",
    createdAt: "2026-08-15T00:00:00.000Z",
    confirmationNeedsResend: false,
    orderSource: "walk_in",
    fulfilmentMethod: "pickup",
    readyAt: null,
    pickedUpAt: null,
    outForDeliveryAt: null,
    deliveredAt: null,
    paymentDeadlineAt: null,
    hasPendingFeeRequest: false,
    ...partial,
  };
}

const now = new Date("2026-08-15T04:00:00.000Z");

const orders = [
  listItem({
    id: "a",
    pickupDate: "2026-08-15",
    status: "submitted",
    fulfilmentMethod: "pickup",
  }),
  listItem({
    id: "b",
    pickupDate: "2026-08-15",
    status: "awaiting_payment",
    fulfilmentMethod: "delivery",
    orderNumber: "WB-2",
    customerName: "Ben",
  }),
  listItem({
    id: "c",
    pickupDate: "2026-08-15",
    status: "paid",
    fulfilmentMethod: "pickup",
    readyAt: "2026-08-15T01:00:00.000Z",
    orderNumber: "WB-3",
  }),
  listItem({
    id: "d",
    pickupDate: "2026-08-15",
    status: "paid",
    fulfilmentMethod: "pickup",
    readyAt: "2026-08-15T01:00:00.000Z",
    pickedUpAt: "2026-08-15T03:00:00.000Z",
    orderNumber: "WB-4",
  }),
  listItem({
    id: "e",
    pickupDate: "2026-08-16",
    status: "submitted",
  }),
];

const readyCollection: CollectionBoardOrder[] = [
  {
    id: "c",
    orderNumber: "WB-3",
    guestName: "Amy",
    pickupDate: "2026-08-15",
    pickupTime: "15:00:00",
    fulfilmentMethod: "pickup",
    status: "paid",
    customerNotes: null,
    productionStartedAt: null,
    readyAt: "2026-08-15T01:00:00.000Z",
    pickedUpAt: null,
    deliveredAt: null,
    includeReceipt: false,
    cakeLines: [],
    complimentaryItems: [],
    paidAddons: [],
  },
];

const completedCollection: CollectionBoardOrder[] = [
  {
    ...readyCollection[0],
    id: "d",
    orderNumber: "WB-4",
    readyAt: "2026-08-15T01:00:00.000Z",
    pickedUpAt: "2026-08-15T03:00:00.000Z",
  },
  {
    ...readyCollection[0],
    id: "f",
    orderNumber: "WB-5",
    fulfilmentMethod: "delivery",
    guestName: "Dee",
    readyAt: "2026-08-15T01:00:00.000Z",
    pickedUpAt: null,
    deliveredAt: "2026-08-15T05:00:00.000Z",
  },
];

const bakeryOrders: BakeryBoardOrder[] = [
  {
    id: "c",
    orderNumber: "WB-3",
    guestName: "Amy",
    pickupDate: "2026-08-15",
    pickupTime: "15:00:00",
    fulfilmentMethod: "pickup",
    status: "paid",
    customerNotes: null,
    needsBakeryAttention: false,
    bakeryAttentionNote: null,
    productionStartedAt: "2026-08-15T00:30:00.000Z",
    productionStartedBy: null,
    readyAt: "2026-08-15T01:00:00.000Z",
    pickedUpAt: null,
    outForDeliveryAt: null,
    includeReceipt: false,
    cakeLines: [],
    complimentaryItems: [],
    paidAddons: [],
  },
];

const model = buildHomeCockpitModel({
  orders,
  readyCollection,
  completedCollection,
  bakeryOrders,
  pendingApprovals: [{ id: "ap-1" } as never],
  navigation: getNavigationForRole("manager"),
  now,
});

assert.equal(model.summary.ordersToday, 4);
assert.equal(model.summary.pickupsToday, 3);
assert.equal(model.summary.deliveriesToday, 1);
assert.equal(model.summary.ready, 1);
assert.equal(model.summary.completed, 1);
assert.ok(model.summary.needAttention >= 2);
assert.equal(model.summary.pendingApprovals, 1);
assert.ok(model.attentionGroups.length > 0);
assert.equal(model.handoffs.ready, 1);
assert.equal(model.handoffs.pickedUp, 1);
assert.equal(model.handoffs.delivered, 1);
assert.equal(model.schedule.total, 1);
assert.equal(model.schedule.ready, 1);

const ownerNav = getNavigationForRole("owner").map((i) => i.id);
assert.equal(ownerNav[0], "home", "Owner Home is first");
assert.deepEqual(ownerNav, [
  "home",
  "owner",
  "owner_calendar",
  "bakery",
  "collection",
  "customer_operations",
  "library",
]);

const managerNavIds = getNavigationForRole("manager").map((i) => i.id);
assert.deepEqual(managerNavIds, [
  "home",
  "owner",
  "owner_calendar",
  "customer_operations",
  "bakery",
  "collection",
  "library",
]);

const vivianNavIds = getNavigationForRole("customer_operations").map((i) => i.id);
assert.deepEqual(vivianNavIds, [
  "home",
  "owner",
  "customer_operations",
  "owner_calendar",
  "collection",
]);

const ownerLinks = homeQuickLinksFromNavigation(
  getNavigationForRole("owner"),
).map((i) => i.id);
assert.ok(ownerLinks.includes("owner"));
assert.ok(ownerLinks.includes("collection"));
assert.ok(ownerLinks.includes("customer_operations"));
assert.ok(ownerLinks.includes("bakery"));
assert.ok(ownerLinks.includes("owner_calendar"));

const managerLinks = homeQuickLinksFromNavigation(
  getNavigationForRole("manager"),
).map((i) => i.id);
assert.ok(managerLinks.includes("owner"));
assert.ok(managerLinks.includes("collection"));
assert.ok(managerLinks.includes("customer_operations"));
assert.ok(managerLinks.includes("bakery"));
assert.ok(managerLinks.includes("owner_calendar"));
assert.ok(!managerLinks.includes("home"));

const vivianLinks = homeQuickLinksFromNavigation(
  getNavigationForRole("customer_operations"),
).map((i) => i.id);
assert.ok(vivianLinks.includes("owner"));
assert.ok(vivianLinks.includes("collection"));
assert.ok(vivianLinks.includes("customer_operations"));
assert.ok(vivianLinks.includes("owner_calendar"));
assert.ok(!vivianLinks.includes("bakery"));

assert.equal(canAccessOperationsBoard("manager"), true);
assert.equal(canAccessOperationsBoard("customer_operations"), true);
assert.equal(canAccessOperationsBoard("owner"), true);
assert.equal(canAccessCollectionWorkspace("manager"), true);
assert.equal(canAccessCollectionWorkspace("customer_operations"), true);
assert.equal(canAccessBakeryWorkspace("manager"), true);
assert.equal(canAccessBakeryWorkspace("customer_operations"), false);

const empty = buildHomeCockpitModel({
  orders: [],
  readyCollection: [],
  completedCollection: [],
  bakeryOrders: [],
  pendingApprovals: [],
  navigation: getNavigationForRole("manager"),
  now,
});
assert.equal(empty.summary.ordersToday, 0);
assert.equal(empty.attentionGroups.length, 0);
assert.equal(empty.handoffs.ready, 0);

assert.equal(canAccessOperationsApprovalsInbox("owner"), true);
assert.equal(canAccessOperationsApprovalsInbox("manager"), true);
assert.equal(canAccessOperationsApprovalsInbox("customer_operations"), false);
assert.equal(homePendingApprovalsHref("owner"), "/owner/approvals");
assert.equal(homePendingApprovalsHref("manager"), "/owner/approvals");
assert.equal(
  homePendingApprovalsHref("customer_operations"),
  "/owner?pickup=today#operations-approvals",
);

const pageSrc = readFileSync(resolve("src/app/(app)/home/page.tsx"), "utf8");
assert.match(pageSrc, /buildHomeCockpitModel/);
assert.match(pageSrc, /HomeCockpit/);
assert.match(pageSrc, /listGuestOrders/);
assert.match(pageSrc, /listCollectionBoardOrders/);
assert.match(pageSrc, /listCollectionCompletedOrders/);
assert.match(pageSrc, /listBakeryBoardOrders/);
assert.match(pageSrc, /listPendingOperationsApprovals/);
assert.match(pageSrc, /homePendingApprovalsHref/);
assert.doesNotMatch(pageSrc, /canUseOwnerBoardTools/);
assert.doesNotMatch(pageSrc, /Propose EXTRA/);
assert.doesNotMatch(pageSrc, /Mark Ready/);

const uiSrc = readFileSync(
  resolve("src/workspaces/home/HomeCockpit.tsx"),
  "utf8",
);
assert.match(uiSrc, /Needs Attention/);
assert.match(uiSrc, /Today's Handoffs/);
assert.match(uiSrc, /Today's Schedule/);
assert.match(uiSrc, /Quick Links/);
assert.match(uiSrc, /Nothing needs your attention/);
assert.match(uiSrc, /No orders today/);
assert.match(uiSrc, /No pickups or deliveries yet/);
assert.match(uiSrc, /ownerOrderWorkspaceHref/);
assert.match(uiSrc, /returnTo|HOME_RETURN|\/home/);
assert.match(uiSrc, /View Operations/);
assert.match(uiSrc, /View Collection/);
assert.match(uiSrc, /homeGreetingTitle/);
assert.match(uiSrc, /preferCalendarScheduleCta/);
assert.match(uiSrc, /View Calendar →/);
assert.match(uiSrc, /View Bakery →/);
assert.match(uiSrc, /\/owner\/calendar/);
assert.match(uiSrc, /pendingApprovalsHref/);
assert.doesNotMatch(uiSrc, /href=\{APPROVALS_HREF\}/);
assert.doesNotMatch(uiSrc, /canOverrideDiscountEligibility/);
assert.doesNotMatch(uiSrc, /Propose EXTRA/);
assert.doesNotMatch(uiSrc, /Mark Ready/);

const pageSrcAfter = readFileSync(resolve("src/app/(app)/home/page.tsx"), "utf8");
assert.match(
  pageSrcAfter,
  /preferCalendarScheduleCta=\{role === "owner"\}/,
);

const modelSrc = readFileSync(
  resolve("src/workspaces/home/cockpit-model.ts"),
  "utf8",
);
assert.match(modelSrc, /partitionOwnerOperationsTodayOrders/);
assert.match(modelSrc, /deriveOwnerAttention/);
assert.match(modelSrc, /homeQuickLinksFromNavigation/);

console.log("PASS Home cockpit");
