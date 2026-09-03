import { formatDateTime, formatShortBusinessDate } from "@/lib/dates";

export type ProductionCapacityRow = {
  id: string;
  pickupDate: string;
  cakeId: string;
  cakeName: string;
  sizeId: string | null;
  sizeLabel: string | null;
  collectionId: string | null;
  collectionLabel: string | null;
  quantity: number;
  committedQuantity: number;
  waitingListEnabled: boolean;
  note: string | null;
};

export type ProductionCapacityCakeOption = {
  id: string;
  name: string;
  sizes: Array<{ id: string; label: string }>;
};

export type ProductionCapacityEvent = {
  pickupDate: string;
  cakeName: string;
  sizeLabel: string | null;
  previousQuantity: number | null;
  newQuantity: number;
  removed: boolean;
  createdAt: string;
  actorName: string | null;
};

export function formatCapacityEventSummary(event: ProductionCapacityEvent): string {
  const size = event.sizeLabel ? ` (${event.sizeLabel})` : "";
  if (event.removed) {
    return `${event.cakeName}${size} — unrestricted`;
  }
  const from =
    event.previousQuantity === null ? "set" : `${event.previousQuantity} →`;
  return `${event.cakeName}${size} — ${from} ${event.newQuantity}`;
}

export function formatCapacityEventWhen(event: ProductionCapacityEvent): string {
  return `${formatShortBusinessDate(event.pickupDate)} · ${formatDateTime(event.createdAt)}`;
}
