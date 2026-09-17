import { isFulfilmentTerminal } from "@/engines/orders/operational-state";
import type { FulfilmentMethod, PaymentStatus } from "@/types/order";
import {
  isPhoneSpecificEnoughForGuestMatch,
  malaysiaPhoneEquivalenceKeys,
  phonesMatchForCustomerHistory,
} from "@/workspaces/customer-operations/customers/normalize";
import { ownerOrderWorkspaceHref } from "@/workspaces/owner/navigation/return-to";

export type CustomerHistorySection = "upcoming" | "past" | "cancelled";

export type CustomerHistoryMatch = "crm" | "guest_phone";

export type CustomerHistoryOrder = {
  id: string;
  orderNumber: string;
  customerId: string | null;
  guestPhone: string | null;
  pickupDate: string;
  pickupTime: string;
  status: string;
  paymentStatus: PaymentStatus | string | null;
  fulfilmentMethod: FulfilmentMethod | string | null;
  orderSource: string | null;
  extraStockId: string | null;
  createdAt: string;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  match: CustomerHistoryMatch;
};

export type CustomerHistorySummary = {
  totalOrders: number;
  upcomingCount: number;
  pastCount: number;
  cancelledCount: number;
  firstPickupDate: string | null;
  lastPickupDate: string | null;
  repeatLabel: "New" | "Returning" | null;
  guestMatchingUsed: boolean;
};

export type GroupedCustomerHistory = {
  upcoming: CustomerHistoryOrder[];
  past: CustomerHistoryOrder[];
  cancelled: CustomerHistoryOrder[];
  summary: CustomerHistorySummary;
};

export function customerProfilePath(customerId: string): string {
  return `/customer-operations/customers/${customerId}`;
}

export function customerHistoryOrderHref(
  order: Pick<CustomerHistoryOrder, "id" | "customerId">,
  profileCustomerId: string,
): string {
  if (order.customerId) {
    return `/customer-operations/orders/${order.id}`;
  }

  return ownerOrderWorkspaceHref(
    order.id,
    customerProfilePath(profileCustomerId),
  );
}

export function guestPhoneMatchesCustomer(
  customerPhoneNormalized: string | null | undefined,
  customerPhoneDisplay: string | null | undefined,
  guestPhone: string | null | undefined,
): boolean {
  const crmPhone = customerPhoneNormalized || customerPhoneDisplay;
  return phonesMatchForCustomerHistory(crmPhone, guestPhone);
}

export function shouldAttemptGuestPhoneMatch(
  customerPhoneNormalized: string | null | undefined,
  customerPhoneDisplay: string | null | undefined,
): boolean {
  return isPhoneSpecificEnoughForGuestMatch(
    customerPhoneNormalized || customerPhoneDisplay,
  );
}

export function guestPhoneFilterKeys(
  customerPhoneNormalized: string | null | undefined,
  customerPhoneDisplay: string | null | undefined,
): string[] {
  if (
    !shouldAttemptGuestPhoneMatch(
      customerPhoneNormalized,
      customerPhoneDisplay,
    )
  ) {
    return [];
  }

  return malaysiaPhoneEquivalenceKeys(
    customerPhoneNormalized || customerPhoneDisplay,
  );
}

export function dedupeCustomerHistoryOrders(
  orders: CustomerHistoryOrder[],
): CustomerHistoryOrder[] {
  const byId = new Map<string, CustomerHistoryOrder>();

  for (const order of orders) {
    const existing = byId.get(order.id);
    if (!existing) {
      byId.set(order.id, order);
      continue;
    }
    if (existing.match === "guest_phone" && order.match === "crm") {
      byId.set(order.id, order);
    }
  }

  return [...byId.values()];
}

function isCancelledStatus(status: string): boolean {
  return status === "cancelled";
}

function isCompletedStatus(status: string): boolean {
  return status === "completed";
}

export function classifyCustomerHistorySection(
  order: Pick<
    CustomerHistoryOrder,
    | "status"
    | "pickupDate"
    | "fulfilmentMethod"
    | "pickedUpAt"
    | "deliveredAt"
  >,
  todayYmd: string,
): CustomerHistorySection {
  if (isCancelledStatus(order.status)) {
    return "cancelled";
  }

  const fulfilled =
    isCompletedStatus(order.status) ||
    isFulfilmentTerminal({
      readyAt: null,
      pickedUpAt: order.pickedUpAt,
      deliveredAt: order.deliveredAt,
      fulfilmentMethod:
        order.fulfilmentMethod === "pickup" ||
        order.fulfilmentMethod === "delivery" ||
        order.fulfilmentMethod === "drive_through" ||
        order.fulfilmentMethod === "dine_in"
          ? order.fulfilmentMethod
          : null,
    });

  if (fulfilled) {
    return "past";
  }

  if (order.pickupDate >= todayYmd) {
    return "upcoming";
  }

  return "past";
}

function comparePickupAsc(a: CustomerHistoryOrder, b: CustomerHistoryOrder) {
  const date = a.pickupDate.localeCompare(b.pickupDate);
  if (date !== 0) return date;
  return a.pickupTime.localeCompare(b.pickupTime);
}

function comparePickupDesc(a: CustomerHistoryOrder, b: CustomerHistoryOrder) {
  return comparePickupAsc(b, a);
}

export function groupCustomerHistory(
  orders: CustomerHistoryOrder[],
  todayYmd: string,
  guestMatchingUsed: boolean,
): GroupedCustomerHistory {
  const unique = dedupeCustomerHistoryOrders(orders);
  const upcoming: CustomerHistoryOrder[] = [];
  const past: CustomerHistoryOrder[] = [];
  const cancelled: CustomerHistoryOrder[] = [];

  for (const order of unique) {
    const section = classifyCustomerHistorySection(order, todayYmd);
    if (section === "upcoming") upcoming.push(order);
    else if (section === "cancelled") cancelled.push(order);
    else past.push(order);
  }

  upcoming.sort(comparePickupAsc);
  past.sort(comparePickupDesc);
  cancelled.sort(comparePickupDesc);

  const pickupDates = unique
    .map((order) => order.pickupDate)
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort();

  const totalOrders = unique.length;

  return {
    upcoming,
    past,
    cancelled,
    summary: {
      totalOrders,
      upcomingCount: upcoming.length,
      pastCount: past.length,
      cancelledCount: cancelled.length,
      firstPickupDate: pickupDates[0] ?? null,
      lastPickupDate: pickupDates[pickupDates.length - 1] ?? null,
      repeatLabel:
        totalOrders >= 2 ? "Returning" : totalOrders === 1 ? "New" : null,
      guestMatchingUsed,
    },
  };
}

export function customerHistoryOrderKindLabel(
  order: Pick<CustomerHistoryOrder, "customerId" | "extraStockId">,
): string {
  if (order.extraStockId) {
    return "Fresh Picks";
  }
  if (!order.customerId) {
    return "Whole Cake";
  }
  return "Staff order";
}

export function customerHistoryScheduleLabel(
  fulfilmentMethod: CustomerHistoryOrder["fulfilmentMethod"],
): string {
  if (fulfilmentMethod === "dine_in") {
    return "Dine-in";
  }
  if (fulfilmentMethod === "delivery") {
    return "Delivery";
  }
  if (fulfilmentMethod === "drive_through") {
    return "Drive-through";
  }
  return "Pickup";
}
