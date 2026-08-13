/**
 * M5-P1 — map slim Bakery DB rows → board DTO (no network).
 */

import { normalizeFulfilmentMethod } from "@/engines/orders/fulfilment";
import type { GuestOrderStatus } from "@/types/storefront";
import type {
  BakeryBoardOrder,
  BakeryCakeLine,
  BakeryComplimentaryLine,
  BakeryPaidAddonLine,
} from "@/workspaces/bakery/types";

export type BakeryOrderRow = {
  id: string;
  order_number: string;
  guest_name: string | null;
  customer_id: string | null;
  pickup_date: string;
  pickup_time: string;
  fulfilment_method: string | null;
  status: GuestOrderStatus;
  customer_notes: string | null;
  needs_bakery_attention: boolean | null;
  bakery_attention_note: string | null;
  production_started_at: string | null;
  production_started_by: string | null;
  ready_at: string | null;
  picked_up_at: string | null;
  out_for_delivery_at: string | null;
  include_receipt: boolean | null;
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

function mapCakeLines(row: BakeryOrderRow): BakeryCakeLine[] {
  return [...(row.order_items ?? [])]
    .sort((a, b) => a.id.localeCompare(b.id, "en"))
    .map((item) => ({
      id: item.id,
      cakeName: item.cake_name ?? "Cake",
      sizeLabel: item.size_label ?? "Size",
      quantity: Number(item.quantity) || 1,
    }));
}

function mapComplimentary(row: BakeryOrderRow): BakeryComplimentaryLine[] {
  return [...(row.order_complimentary_items ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item) => ({
      id: item.id,
      name: item.name,
      quantity: Number(item.quantity) || 1,
      sortOrder: item.sort_order,
    }));
}

function mapPaidAddons(row: BakeryOrderRow): BakeryPaidAddonLine[] {
  return [...(row.order_paid_addons ?? [])]
    .sort(
      (a, b) =>
        a.sort_order - b.sort_order || a.code.localeCompare(b.code, "en"),
    )
    .map((addon) => {
      const quantity = Math.max(1, Number(addon.quantity) || 1);
      const childMessages = [...(addon.order_paid_addon_messages ?? [])].sort(
        (a, b) => a.card_index - b.card_index,
      );
      const messages =
        childMessages.length > 0
          ? childMessages.map((m) => ({
              cardIndex: Number(m.card_index),
              writtenMessage: m.written_message,
            }))
          : addon.written_message
            ? [{ cardIndex: 1, writtenMessage: addon.written_message }]
            : Array.from({ length: quantity }, (_, i) => ({
                cardIndex: i + 1,
                writtenMessage: null as string | null,
              }));

      return {
        id: addon.id,
        code: addon.code,
        name: addon.name,
        quantity,
        sortOrder: addon.sort_order,
        messages,
      };
    });
}

export function mapBakeryBoardOrder(row: BakeryOrderRow): BakeryBoardOrder {
  return {
    id: row.id,
    orderNumber: row.order_number,
    guestName: row.guest_name?.trim() || "Guest",
    pickupDate: row.pickup_date,
    pickupTime: row.pickup_time,
    fulfilmentMethod: normalizeFulfilmentMethod(row.fulfilment_method),
    status: row.status,
    customerNotes: row.customer_notes,
    needsBakeryAttention: Boolean(row.needs_bakery_attention),
    bakeryAttentionNote: row.bakery_attention_note,
    productionStartedAt: row.production_started_at ?? null,
    productionStartedBy: row.production_started_by ?? null,
    readyAt: row.ready_at,
    pickedUpAt: row.picked_up_at,
    outForDeliveryAt: row.out_for_delivery_at,
    includeReceipt: Boolean(row.include_receipt),
    cakeLines: mapCakeLines(row),
    complimentaryItems: mapComplimentary(row),
    paidAddons: mapPaidAddons(row),
  };
}
