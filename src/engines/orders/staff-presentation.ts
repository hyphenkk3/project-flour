import {
  formatLongBusinessDate,
  toBusinessDateKey,
} from "@/lib/dates";

export type FulfilmentDayPresentation = {
  label: string;
  kind: "today" | "tomorrow" | "date";
};

export function isFreshPickOrder(extraStockId: string | null | undefined): boolean {
  return Boolean(extraStockId?.trim());
}

export function freshPickAllocationNeedsStaffAction(input: {
  status: string;
  fullyCovered: boolean;
  totalRemainingQuantity: number;
  totalAssignedQuantity: number;
  assignedStockCount: number;
  allAssignedStocksReady: boolean;
}): boolean {
  return (
    input.status !== "verified" ||
    !input.fullyCovered ||
    input.totalRemainingQuantity > 0 ||
    input.totalAssignedQuantity === 0 ||
    input.assignedStockCount !== input.totalAssignedQuantity ||
    !input.allAssignedStocksReady
  );
}

export function isFreshPickBakeryActionRequired(input: {
  extraStockId: string | null | undefined;
  status: string;
  needsBakeryAttention: boolean;
  readyAt: string | null;
  pickedUpAt: string | null;
  outForDeliveryAt: string | null;
  deliveredAt: string | null;
  allocationStatus: string;
  fullyCovered: boolean;
  totalRemainingQuantity: number;
  totalAssignedQuantity: number;
  assignedStockCount: number;
  allAssignedStocksReady: boolean;
}): boolean {
  if (
    !isFreshPickOrder(input.extraStockId) ||
    input.status !== "paid" ||
    input.readyAt ||
    input.pickedUpAt ||
    input.outForDeliveryAt ||
    input.deliveredAt
  ) {
    return false;
  }
  return (
    input.needsBakeryAttention ||
    freshPickAllocationNeedsStaffAction({
      status: input.allocationStatus,
      fullyCovered: input.fullyCovered,
      totalRemainingQuantity: input.totalRemainingQuantity,
      totalAssignedQuantity: input.totalAssignedQuantity,
      assignedStockCount: input.assignedStockCount,
      allAssignedStocksReady: input.allAssignedStocksReady,
    })
  );
}

/** Dine-in reservation date is its fulfilment date; other methods use orders.pickup_date. */
export function orderFulfilmentDate(input: {
  fulfilmentMethod: string | null | undefined;
  pickupDate: string;
  dineInReservationDate?: string | null;
}): string {
  if (input.fulfilmentMethod === "dine_in" && input.dineInReservationDate) {
    return input.dineInReservationDate.slice(0, 10);
  }
  return input.pickupDate.slice(0, 10);
}

/** Uses Malaysia's calendar day, independent of the server or browser timezone. */
export function fulfilmentDayPresentation(
  fulfilmentDate: string,
  now: Date = new Date(),
): FulfilmentDayPresentation {
  const date = fulfilmentDate.trim().slice(0, 10);
  const today = toBusinessDateKey(now);
  const [year, month, day] = today.split("-").map(Number);
  const tomorrowDate = new Date(Date.UTC(year, month - 1, day + 1));
  const tomorrow = `${tomorrowDate.getUTCFullYear()}-${String(
    tomorrowDate.getUTCMonth() + 1,
  ).padStart(2, "0")}-${String(tomorrowDate.getUTCDate()).padStart(2, "0")}`;
  if (date === today) return { label: "TODAY", kind: "today" };
  if (date === tomorrow) return { label: "TOMORROW", kind: "tomorrow" };
  return { label: formatLongBusinessDate(date), kind: "date" };
}

/** The urgent cue is separate from payment, preparation, readiness, and handoff states. */
export function isFreshPickActionDueToday(input: {
  extraStockId: string | null | undefined;
  fulfilmentDate: string;
  actionRequired: boolean;
  terminal: boolean;
  now?: Date;
}): boolean {
  if (!isFreshPickOrder(input.extraStockId) || !input.actionRequired || input.terminal) {
    return false;
  }
  return fulfilmentDayPresentation(input.fulfilmentDate, input.now).kind === "today";
}
