/**
 * Map Collection DB rows → desk DTO.
 */

import {
  mapOrderDineInReservation,
  normalizeFulfilmentMethod,
} from "@/engines/orders/fulfilment";
import type { GuestOrderStatus } from "@/types/storefront";
import type {
  CollectionBoardOrder,
  CollectionCakeLine,
  CollectionComplimentaryLine,
  CollectionDineInReservation,
  CollectionPaidAddonLine,
} from "@/workspaces/collection/types";

export type CollectionOrderRow = {
  id: string;
  order_number: string;
  guest_name: string | null;
  guest_phone: string | null;
  customer_id: string | null;
  pickup_date: string;
  pickup_time: string;
  fulfilment_method: string | null;
  status: GuestOrderStatus;
  customer_notes: string | null;
  production_started_at: string | null;
  ready_at: string | null;
  picked_up_at: string | null;
  out_for_delivery_at: string | null;
  delivered_at: string | null;
  include_receipt: boolean | null;
  order_dine_in_reservations?:
    | {
        reservation_date: string | null;
        reservation_time: string | null;
        venue: string | null;
        guest_count: number | string | null;
        reservation_note: string | null;
        status: string | null;
      }
    | {
        reservation_date: string | null;
        reservation_time: string | null;
        venue: string | null;
        guest_count: number | string | null;
        reservation_note: string | null;
        status: string | null;
      }[]
    | null;
  order_items?: Array<{
    id: string;
    cake_name: string | null;
    size_label: string | null;
    quantity: number;
  }> | null;
  order_complimentary_items?: Array<{
    id: string;
    name: string;
    quantity: number;
    sort_order: number;
  }> | null;
  order_paid_addons?: Array<{
    id: string;
    code: string;
    name: string;
    quantity: number;
    sort_order: number;
    written_message: string | null;
    order_paid_addon_messages?: Array<{
      card_index: number;
      written_message: string | null;
    }> | null;
  }> | null;
};

function mapCakeLines(row: CollectionOrderRow): CollectionCakeLine[] {
  return [...(row.order_items ?? [])]
    .sort((a, b) => a.id.localeCompare(b.id, "en"))
    .map((item) => ({
      id: item.id,
      cakeName: item.cake_name ?? "Cake",
      sizeLabel: item.size_label ?? "Size",
      quantity: Number(item.quantity) || 1,
    }));
}

function mapComplimentary(row: CollectionOrderRow): CollectionComplimentaryLine[] {
  return [...(row.order_complimentary_items ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item) => ({
      id: item.id,
      name: item.name,
      quantity: Number(item.quantity) || 1,
      sortOrder: item.sort_order,
    }));
}

function mapPaidAddons(row: CollectionOrderRow): CollectionPaidAddonLine[] {
  return [...(row.order_paid_addons ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((addon) => {
      const fromCards = [...(addon.order_paid_addon_messages ?? [])]
        .sort((a, b) => a.card_index - b.card_index)
        .map((msg) => ({
          cardIndex: msg.card_index,
          writtenMessage: msg.written_message,
        }));
      const messages =
        fromCards.length > 0
          ? fromCards
          : addon.written_message
            ? [{ cardIndex: 1, writtenMessage: addon.written_message }]
            : [];
      return {
        id: addon.id,
        code: addon.code,
        name: addon.name,
        quantity: Number(addon.quantity) || 1,
        sortOrder: addon.sort_order,
        messages,
      };
    });
}

function firstDineInReservation(row: CollectionOrderRow) {
  const value = row.order_dine_in_reservations;
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function mapDineIn(row: CollectionOrderRow): CollectionDineInReservation | null {
  const mapped = mapOrderDineInReservation(firstDineInReservation(row));
  if (!mapped) return null;
  return {
    reservationDate: mapped.reservationDate,
    reservationTime: mapped.reservationTime,
    venue: mapped.venue,
    guestCount: mapped.guestCount,
    reservationNote: mapped.reservationNote,
  };
}

export function mapCollectionBoardOrder(row: CollectionOrderRow): CollectionBoardOrder {
  const phone = row.guest_phone?.trim() ?? "";
  return {
    id: row.id,
    orderNumber: row.order_number,
    guestName: row.guest_name?.trim() || "Guest",
    guestPhone: phone.length > 0 ? phone : null,
    pickupDate: row.pickup_date,
    pickupTime: row.pickup_time,
    fulfilmentMethod: normalizeFulfilmentMethod(row.fulfilment_method),
    status: row.status,
    customerNotes: row.customer_notes,
    productionStartedAt: row.production_started_at,
    readyAt: row.ready_at,
    pickedUpAt: row.picked_up_at,
    outForDeliveryAt: row.out_for_delivery_at,
    deliveredAt: row.delivered_at,
    includeReceipt: Boolean(row.include_receipt),
    dineIn: mapDineIn(row),
    cakeLines: mapCakeLines(row),
    complimentaryItems: mapComplimentary(row),
    paidAddons: mapPaidAddons(row),
  };
}
