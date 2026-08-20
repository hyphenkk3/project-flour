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
import {
  GUEST_ORDERS_LIVE_POLL_MS,
  isGuestOrderLiveEvent,
} from "@/workspaces/owner/orders/guest-orders-live";
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
    crewOrder: false,
    extraStockId: null,
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
    guestPhone: null,
    pickupDate: "2026-08-15",
    pickupTime: "15:00:00",
    fulfilmentMethod: "pickup",
    status: "paid",
    customerNotes: null,
    productionStartedAt: null,
    readyAt: "2026-08-15T01:00:00.000Z",
    pickedUpAt: null,
    outForDeliveryAt: null,
    deliveredAt: null,
    includeReceipt: false,
    dineIn: null,
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
    outForDeliveryAt: null,
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
assert.equal(model.handoffs.deliveryReady, 0);
assert.equal(model.handoffs.pickedUp, 1);
assert.equal(model.handoffs.delivered, 1);
assert.equal(model.handoffs.outForDelivery, 0);
assert.equal(model.summary.dineInsToday, 0);
assert.equal(model.handoffs.dineInPending, 0);
assert.equal(model.handoffs.dineInCompleted, 0);
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
assert.equal(empty.summary.dineInsToday, 0);
assert.equal(empty.attentionGroups.length, 0);
assert.equal(empty.handoffs.ready, 0);
assert.equal(empty.handoffs.dineInPending, 0);
assert.equal(empty.handoffs.dineInCompleted, 0);

assert.equal(canAccessCollectionWorkspace("bakery"), false);
assert.equal(canAccessCollectionWorkspace("collection"), true);
assert.equal(canAccessCollectionWorkspace("owner"), true);
assert.equal(canAccessCollectionWorkspace("manager"), true);
assert.equal(canAccessCollectionWorkspace("customer_operations"), true);
assert.equal(canAccessBakeryWorkspace("bakery"), true);

const pendingDineInOrder: CollectionBoardOrder = {
  ...readyCollection[0],
  id: "di-pending",
  orderNumber: "WB-DI-1",
  guestName: "Gia",
  guestPhone: "0190000001",
  fulfilmentMethod: "dine_in",
  pickupTime: "15:00:00",
  readyAt: "2026-08-15T01:00:00.000Z",
  pickedUpAt: null,
  deliveredAt: null,
  dineIn: {
    reservationDate: "2026-08-15",
    reservationTime: "14:00:00",
    venue: "hyphen",
    guestCount: 2,
    reservationNote: null,
  },
};

const completedDineInOrder: CollectionBoardOrder = {
  ...pendingDineInOrder,
  id: "di-done",
  orderNumber: "WB-DI-2",
  guestName: "Han",
  pickupTime: "16:00:00",
  pickedUpAt: "2026-08-15T08:00:00.000Z",
  dineIn: {
    reservationDate: "2026-08-15",
    reservationTime: "15:00:00",
    venue: "whitebird",
    guestCount: 4,
    reservationNote: null,
  },
};

const deliveryOutOrder = listItem({
  id: "g",
  pickupDate: "2026-08-15",
  status: "paid",
  fulfilmentMethod: "delivery",
  orderNumber: "WB-6",
  customerName: "Eve",
  readyAt: "2026-08-15T01:00:00.000Z",
  outForDeliveryAt: "2026-08-15T02:00:00.000Z",
});

const dineInModel = buildHomeCockpitModel({
  orders: [
    ...orders,
    listItem({
      id: "di-pending",
      pickupDate: "2026-08-15",
      status: "paid",
      fulfilmentMethod: "dine_in",
      readyAt: "2026-08-15T01:00:00.000Z",
      orderNumber: "WB-DI-1",
      customerName: "Gia",
    }),
    listItem({
      id: "di-done",
      pickupDate: "2026-08-15",
      status: "paid",
      fulfilmentMethod: "dine_in",
      readyAt: "2026-08-15T01:00:00.000Z",
      pickedUpAt: "2026-08-15T08:00:00.000Z",
      orderNumber: "WB-DI-2",
      customerName: "Han",
    }),
  ],
  readyCollection,
  completedCollection: [...completedCollection, completedDineInOrder],
  dineInCollection: [pendingDineInOrder],
  bakeryOrders,
  pendingApprovals: [],
  navigation: getNavigationForRole("owner"),
  now,
});

assert.equal(dineInModel.summary.dineInsToday, 2);
assert.equal(dineInModel.summary.pickupsToday, 3);
assert.equal(dineInModel.summary.deliveriesToday, 1);
assert.equal(dineInModel.summary.ready, 1, "dine-in ready must not increment Ready");
assert.equal(dineInModel.handoffs.ready, 1, "pickup Ready queue unchanged");
assert.equal(dineInModel.handoffs.pickedUp, 1, "completed dine-in is not Picked Up");
assert.equal(dineInModel.handoffs.delivered, 1, "completed dine-in is not Delivered");
assert.equal(dineInModel.handoffs.outForDelivery, 0);

const deliveryOutModel = buildHomeCockpitModel({
  orders: [...orders, deliveryOutOrder],
  readyCollection,
  completedCollection,
  bakeryOrders,
  pendingApprovals: [],
  navigation: getNavigationForRole("manager"),
  now,
});
assert.equal(deliveryOutModel.handoffs.outForDelivery, 1);
assert.equal(
  deliveryOutModel.handoffs.deliveryReady,
  0,
  "OFD is Out for Delivery, not Delivery Ready",
);

const deliveryReadyOnly = listItem({
  id: "delivery-ready-only",
  pickupDate: "2026-08-15",
  status: "paid",
  fulfilmentMethod: "delivery",
  orderNumber: "WB-DR",
  customerName: "Fran",
  readyAt: "2026-08-15T01:00:00.000Z",
  outForDeliveryAt: null,
  deliveredAt: null,
});
const deliveryReadyModel = buildHomeCockpitModel({
  orders: [...orders, deliveryReadyOnly],
  readyCollection,
  completedCollection,
  bakeryOrders,
  pendingApprovals: [],
  navigation: getNavigationForRole("manager"),
  now,
});
assert.equal(deliveryReadyModel.handoffs.deliveryReady, 1);
assert.equal(deliveryReadyModel.handoffs.outForDelivery, 0);
assert.equal(deliveryOutModel.handoffs.delivered, 1);
assert.equal(deliveryOutModel.handoffs.dineInPending, 0);
assert.equal(deliveryOutModel.summary.dineInsToday, 0);
assert.equal(dineInModel.handoffs.dineInPending, 1);
assert.equal(dineInModel.handoffs.dineInCompleted, 1);
assert.equal(dineInModel.handoffs.dineInPreview[0]?.guestName, "Gia");
assert.equal(dineInModel.handoffs.dineInPreview[0]?.venue, "hyphen");
assert.equal(dineInModel.handoffs.dineInPreview[0]?.reservationTime, "14:00:00");
assert.equal(dineInModel.handoffs.dineInPreview[0]?.servingTime, "15:00:00");
assert.equal(dineInModel.handoffs.dineInPreview[0]?.guestCount, 2);
assert.equal(dineInModel.handoffs.dineInCompletedPreview[0]?.guestName, "Han");
assert.equal(dineInModel.handoffs.dineInCompletedPreview[0]?.venue, "whitebird");

const dineInOnly = buildHomeCockpitModel({
  orders: [
    listItem({
      id: "di-only",
      pickupDate: "2026-08-15",
      status: "paid",
      fulfilmentMethod: "dine_in",
      orderNumber: "WB-DI-3",
      customerName: "Ivy",
    }),
  ],
  readyCollection: [],
  completedCollection: [],
  dineInCollection: [
    {
      ...pendingDineInOrder,
      id: "di-only",
      orderNumber: "WB-DI-3",
      guestName: "Ivy",
      readyAt: null,
    },
  ],
  bakeryOrders: [],
  pendingApprovals: [],
  navigation: getNavigationForRole("collection"),
  now,
});
assert.equal(dineInOnly.summary.ordersToday, 1);
assert.equal(dineInOnly.summary.dineInsToday, 1);
assert.equal(dineInOnly.summary.pickupsToday, 0);
assert.equal(dineInOnly.summary.deliveriesToday, 0);
assert.equal(dineInOnly.summary.ready, 0);
assert.equal(dineInOnly.handoffs.ready, 0);
assert.equal(dineInOnly.handoffs.pickedUp, 0);
assert.equal(dineInOnly.handoffs.delivered, 0);
assert.equal(dineInOnly.handoffs.dineInPending, 1);

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
assert.match(pageSrc, /listCollectionDineInOrders/);
assert.match(pageSrc, /dineInCollection/);
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
assert.match(uiSrc, /View Pickup/);
assert.match(uiSrc, /View Delivery/);
assert.match(uiSrc, /View Dine-in/);
assert.match(uiSrc, /Pickup Ready/);
assert.match(uiSrc, /Delivery Ready/);
assert.match(uiSrc, /collectionDateNavHref\(model\.todayYmd, "dine_in"\)/);
assert.match(uiSrc, /collectionDateNavHref\(model\.todayYmd, "pickup"\)/);
assert.match(uiSrc, /collectionDateNavHref\(model\.todayYmd, "delivery"\)/);
assert.match(uiSrc, /collectionOrderHref\([\s\S]*?"pickup"[\s\S]*?\)/);
assert.match(uiSrc, /canAccessCollection \?/);
assert.match(uiSrc, /hasDineInHandoffs/);
assert.doesNotMatch(uiSrc, /payment_overdue.*dine/i);
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
assert.match(modelSrc, /appendPrepareConfirmationInbox/);
assert.match(modelSrc, /deriveOwnerAttention/);
assert.match(modelSrc, /homeQuickLinksFromNavigation/);

assert.ok(
  model.attentionPreview.some((item) => item.id === "e"),
  "future submitted preorder must appear on Home attention",
);

{
  const futureOnly = buildHomeCockpitModel({
    orders: [
      listItem({
        id: "future-sub-pickup",
        pickupDate: "2026-08-21",
        status: "submitted",
        fulfilmentMethod: "pickup",
        orderNumber: "WB-FS-P",
        customerName: "Pat",
      }),
      listItem({
        id: "future-sub-delivery",
        pickupDate: "2026-08-21",
        status: "submitted",
        fulfilmentMethod: "delivery",
        orderNumber: "WB-FS-D",
        customerName: "Del",
      }),
      listItem({
        id: "future-sub-dine",
        pickupDate: "2026-08-21",
        status: "submitted",
        fulfilmentMethod: "dine_in",
        orderNumber: "WB-FS-DI",
        customerName: "Din",
      }),
      listItem({
        id: "future-pay",
        pickupDate: "2026-08-21",
        status: "awaiting_payment",
        orderNumber: "WB-FS-PAY",
      }),
      listItem({
        id: "future-conf",
        pickupDate: "2026-08-21",
        status: "pending_confirmation",
        orderNumber: "WB-FS-CONF",
      }),
    ],
    readyCollection: [],
    completedCollection: [],
    bakeryOrders: [],
    pendingApprovals: [],
    navigation: getNavigationForRole("manager"),
    now,
  });
  assert.equal(futureOnly.summary.ordersToday, 0);
  assert.equal(futureOnly.summary.needAttention, 3);
  assert.equal(
    futureOnly.attentionGroups.find((group) => group.key === "prepare_confirmation")
      ?.count,
    3,
  );
  assert.equal(
    futureOnly.attentionGroups.some((group) => group.key === "payment_needed"),
    false,
  );
  assert.equal(
    futureOnly.attentionGroups.some(
      (group) => group.key === "awaiting_customer_confirmation",
    ),
    false,
  );
  assert.deepEqual(
    futureOnly.attentionPreview.map((item) => item.id).sort(),
    ["future-sub-delivery", "future-sub-dine", "future-sub-pickup"],
  );
}

{
  const buriedNewest = buildHomeCockpitModel({
    orders: [
      ...Array.from({ length: 8 }, (_, index) =>
        listItem({
          id: `old-sub-${index}`,
          pickupDate: "2026-08-15",
          status: "submitted",
          orderNumber: `WB-OLD-${index}`,
          customerName: `Older ${index}`,
          createdAt: `2026-01-0${index + 1}T00:00:00.000Z`,
        }),
      ),
      listItem({
        id: "newest-mangolicious",
        pickupDate: "2026-09-18",
        status: "submitted",
        fulfilmentMethod: "pickup",
        orderNumber: "WB-NEW-MANGO",
        customerName: "Mangolicious Guest",
        pickupTime: "15:30:00",
        createdAt: "2026-08-15T12:00:00.000Z",
      }),
    ],
    readyCollection: [],
    completedCollection: [],
    bakeryOrders: [],
    pendingApprovals: [],
    navigation: getNavigationForRole("manager"),
    now,
  });
  assert.equal(buriedNewest.summary.needAttention, 9);
  assert.equal(buriedNewest.attentionPreview[0]?.id, "newest-mangolicious");
  assert.equal(
    buriedNewest.attentionPreview[0]?.customerName,
    "Mangolicious Guest",
  );
}

assert.equal(GUEST_ORDERS_LIVE_POLL_MS, 30_000);
assert.equal(
  isGuestOrderLiveEvent({ id: "new-preorder", customer_id: null }),
  true,
);
assert.equal(
  isGuestOrderLiveEvent({ id: "member-order", customer_id: "cust-1" }),
  false,
);
assert.equal(isGuestOrderLiveEvent({ customer_id: null }), false);

assert.match(uiSrc, /HomeLiveRefresh/);
const liveSrc = readFileSync(
  resolve("src/workspaces/home/HomeLiveRefresh.tsx"),
  "utf8",
);
assert.match(liveSrc, /postgres_changes/);
assert.match(liveSrc, /router.refresh/);
assert.match(liveSrc, /INSERT/);
assert.match(liveSrc, /table: "orders"/);
assert.match(liveSrc, /GUEST_ORDERS_LIVE_POLL_MS/);
assert.match(liveSrc, /isGuestOrderLiveEvent/);
assert.doesNotMatch(liveSrc, /buildHomeCockpitModel/);
assert.doesNotMatch(liveSrc, /appendPrepareConfirmationInbox/);

const operationsLiveSrc = readFileSync(
  resolve("src/workspaces/owner/OperationsLiveBoard.tsx"),
  "utf8",
);
assert.match(operationsLiveSrc, /postgres_changes/);
assert.match(operationsLiveSrc, /listGuestOrdersAction/);
assert.match(operationsLiveSrc, /GUEST_ORDERS_LIVE_POLL_MS/);
assert.match(operationsLiveSrc, /isGuestOrderLiveEvent/);

console.log("PASS Home cockpit");
