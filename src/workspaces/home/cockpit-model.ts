/**
 * Home v1 cockpit — pure aggregation over existing Operations / Collection /
 * Bakery / approval read models. No new business rules.
 */

import {
  deriveOwnerAttention,
  ownerAttentionInputFromOrder,
  partitionOwnerOperationsTodayOrders,
  type OwnerAttentionReasonKey,
} from "@/engines/operations/owner-attention";
import { operationsTodayYmd } from "@/engines/operations/order-board";
import { isFulfilmentTerminal } from "@/engines/orders/operational-state";
import { bakeryProductionPresentation } from "@/workspaces/bakery/eligibility";
import type { BakeryBoardOrder } from "@/workspaces/bakery/types";
import {
  isCollectionDeliveryMethod,
  isCollectionDineInMethod,
  isCollectionPickupMethod,
} from "@/workspaces/collection/eligibility";
import type { CollectionBoardOrder } from "@/workspaces/collection/types";
import type { OperationsApprovalRecord } from "@/engines/operations/approvals";
import type { StorefrontOrderListItem } from "@/types/storefront";
import type { WorkspaceNavItem } from "@/foundation/navigation/workspaces";

export type HomeTodaySummary = {
  ordersToday: number;
  pickupsToday: number;
  deliveriesToday: number;
  dineInsToday: number;
  ready: number;
  completed: number;
  needAttention: number;
  pendingApprovals: number;
};

export type HomeAttentionGroup = {
  key: OwnerAttentionReasonKey;
  label: string;
  count: number;
};

export type HomeAttentionPreview = {
  id: string;
  orderNumber: string;
  customerName: string;
  primaryLabel: string;
};

export type HomeDineInHandoffPreview = {
  id: string;
  orderNumber: string;
  guestName: string;
  reservationTime: string | null;
  servingTime: string;
  venue: "hyphen" | "whitebird" | null;
  guestCount: number | null;
};

export type HomeHandoffSummary = {
  ready: number;
  pickedUp: number;
  outForDelivery: number;
  delivered: number;
  readyPreview: Array<{
    id: string;
    orderNumber: string;
    guestName: string;
    pickupTime: string;
  }>;
  dineInPending: number;
  dineInCompleted: number;
  dineInPreview: HomeDineInHandoffPreview[];
  dineInCompletedPreview: HomeDineInHandoffPreview[];
};

export type HomeScheduleSummary = {
  total: number;
  notStarted: number;
  inProduction: number;
  ready: number;
  preview: Array<{
    id: string;
    orderNumber: string;
    guestName: string;
    pickupTime: string;
    label: string;
  }>;
};

export type HomeCockpitModel = {
  todayYmd: string;
  summary: HomeTodaySummary;
  attentionGroups: HomeAttentionGroup[];
  attentionPreview: HomeAttentionPreview[];
  handoffs: HomeHandoffSummary;
  schedule: HomeScheduleSummary;
  quickLinks: WorkspaceNavItem[];
};

const QUICK_LINK_IDS = new Set([
  "owner",
  "collection",
  "customer_operations",
  "bakery",
  "owner_calendar",
]);

const ATTENTION_ORDER: OwnerAttentionReasonKey[] = [
  "prepare_confirmation",
  "reconfirmation_required",
  "awaiting_customer_confirmation",
  "payment_overdue",
  "payment_needed",
  "fee_request_pending",
];

export function homeQuickLinksFromNavigation(
  navigation: WorkspaceNavItem[],
): WorkspaceNavItem[] {
  return navigation.filter((item) => QUICK_LINK_IDS.has(item.id));
}

function dineInHandoffPreview(
  order: CollectionBoardOrder,
): HomeDineInHandoffPreview {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    guestName: order.guestName,
    reservationTime: order.dineIn?.reservationTime ?? null,
    servingTime: order.pickupTime,
    venue: order.dineIn?.venue ?? null,
    guestCount: order.dineIn?.guestCount ?? null,
  };
}

export function buildHomeCockpitModel(input: {
  orders: StorefrontOrderListItem[];
  readyCollection: CollectionBoardOrder[];
  completedCollection: CollectionBoardOrder[];
  dineInCollection?: CollectionBoardOrder[];
  bakeryOrders: BakeryBoardOrder[];
  pendingApprovals: OperationsApprovalRecord[];
  navigation: WorkspaceNavItem[];
  now?: Date;
}): HomeCockpitModel {
  const now = input.now ?? new Date();
  const todayYmd = operationsTodayYmd(now);
  const todayOrders = input.orders.filter(
    (order) => order.pickupDate === todayYmd,
  );

  type TodayAttentionOrder = ReturnType<typeof ownerAttentionInputFromOrder> & {
    pickupTime: string;
    orderNumber: string;
    id: string;
    customerName: string;
  };

  const todayAttentionOrders: TodayAttentionOrder[] = todayOrders.map(
    (order) => ({
      ...ownerAttentionInputFromOrder(order),
      pickupTime: order.pickupTime,
      orderNumber: order.orderNumber,
      id: order.id,
      customerName: order.customerName,
    }),
  );

  const buckets = partitionOwnerOperationsTodayOrders(
    todayAttentionOrders,
    now,
  );

  const pickupsToday = todayOrders.filter((order) =>
    isCollectionPickupMethod(order.fulfilmentMethod),
  ).length;
  const deliveriesToday = todayOrders.filter((order) =>
    isCollectionDeliveryMethod(order.fulfilmentMethod),
  ).length;
  const dineInsToday = todayOrders.filter((order) =>
    isCollectionDineInMethod(order.fulfilmentMethod),
  ).length;

  const ready = todayOrders.filter(
    (order) =>
      !isCollectionDineInMethod(order.fulfilmentMethod) &&
      Boolean(order.readyAt) &&
      !isFulfilmentTerminal({
        readyAt: order.readyAt,
        pickedUpAt: order.pickedUpAt,
        outForDeliveryAt: order.outForDeliveryAt,
        deliveredAt: order.deliveredAt,
      }),
  ).length;

  const summary: HomeTodaySummary = {
    ordersToday: todayOrders.length,
    pickupsToday,
    deliveriesToday,
    dineInsToday,
    ready,
    completed: buckets.completed.length,
    needAttention: buckets.needsAttention.length,
    pendingApprovals: input.pendingApprovals.length,
  };

  const attentionCounts = new Map<OwnerAttentionReasonKey, number>();
  const attentionLabels = new Map<OwnerAttentionReasonKey, string>();
  for (const order of buckets.needsAttention) {
    const reasons = deriveOwnerAttention(order, now);
    for (const reason of reasons) {
      attentionCounts.set(
        reason.key,
        (attentionCounts.get(reason.key) ?? 0) + 1,
      );
      attentionLabels.set(reason.key, reason.label);
    }
  }

  const attentionGroups: HomeAttentionGroup[] = ATTENTION_ORDER.flatMap(
    (key) => {
      const count = attentionCounts.get(key) ?? 0;
      if (count === 0) return [];
      return [
        {
          key,
          label: attentionLabels.get(key) ?? key,
          count,
        },
      ];
    },
  );

  const attentionPreview: HomeAttentionPreview[] = buckets.needsAttention
    .slice(0, 5)
    .map((order) => {
      const reasons = deriveOwnerAttention(order, now);
      return {
        id: order.id,
        orderNumber: order.orderNumber ?? "",
        customerName: order.customerName ?? "Guest",
        primaryLabel: reasons[0]?.label ?? "Needs attention",
      };
    });

  const pickedUp = input.completedCollection.filter((order) =>
    isCollectionPickupMethod(order.fulfilmentMethod),
  ).length;
  const delivered = input.completedCollection.filter((order) =>
    isCollectionDeliveryMethod(order.fulfilmentMethod),
  ).length;
  const outForDelivery = todayOrders.filter(
    (order) =>
      isCollectionDeliveryMethod(order.fulfilmentMethod) &&
      Boolean(order.outForDeliveryAt) &&
      !order.deliveredAt,
  ).length;

  const dineInPendingOrders = input.dineInCollection ?? [];
  const dineInCompletedOrders = input.completedCollection.filter((order) =>
    isCollectionDineInMethod(order.fulfilmentMethod),
  );

  const handoffs: HomeHandoffSummary = {
    ready: input.readyCollection.length,
    pickedUp,
    outForDelivery,
    delivered,
    readyPreview: input.readyCollection.slice(0, 3).map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      guestName: order.guestName,
      pickupTime: order.pickupTime,
    })),
    dineInPending: dineInPendingOrders.length,
    dineInCompleted: dineInCompletedOrders.length,
    dineInPreview: dineInPendingOrders.slice(0, 3).map(dineInHandoffPreview),
    dineInCompletedPreview: dineInCompletedOrders
      .slice(0, 3)
      .map(dineInHandoffPreview),
  };

  let notStarted = 0;
  let inProduction = 0;
  let bakeryReady = 0;
  for (const order of input.bakeryOrders) {
    const presentation = bakeryProductionPresentation({
      productionStartedAt: order.productionStartedAt,
      readyAt: order.readyAt,
    });
    if (presentation === "ready") bakeryReady += 1;
    else if (presentation === "in_production") inProduction += 1;
    else notStarted += 1;
  }

  const schedule: HomeScheduleSummary = {
    total: input.bakeryOrders.length,
    notStarted,
    inProduction,
    ready: bakeryReady,
    preview: input.bakeryOrders.slice(0, 3).map((order) => {
      const presentation = bakeryProductionPresentation({
        productionStartedAt: order.productionStartedAt,
        readyAt: order.readyAt,
      });
      return {
        id: order.id,
        orderNumber: order.orderNumber,
        guestName: order.guestName,
        pickupTime: order.pickupTime,
        label:
          presentation === "ready"
            ? "Ready"
            : presentation === "in_production"
              ? "In production"
              : "Not started",
      };
    }),
  };

  return {
    todayYmd,
    summary,
    attentionGroups,
    attentionPreview,
    handoffs,
    schedule,
    quickLinks: homeQuickLinksFromNavigation(input.navigation),
  };
}
