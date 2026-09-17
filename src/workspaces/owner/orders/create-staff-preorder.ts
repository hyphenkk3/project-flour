import { OPERATING_HOURS_SEED } from "@/engines/business-calendar/operating-hours-seed";
import type { OperatingHoursSnapshot } from "@/engines/business-calendar/operating-hours";
import { isValidClockPickupTime } from "@/engines/business-calendar/pickup-slots";
import {
  buildAssistedFulfilmentRpcParams,
  defaultAssistedDineInDraft,
  validateAssistedOrderFulfilment,
  validateAssistedOwnerOverrideFulfilment,
  type AssistedDineInDraft,
} from "@/engines/orders/assisted-fulfilment";
import {
  buildCreateStaffFulfilmentRpcParams,
  normalizeOwnerCreateFulfilmentMethod,
  parseCustomerWebsiteFulfilmentMethod,
  validateOwnerCreateFulfilment,
  type CustomerWebsiteFulfilmentMethod,
  type DeliveryCreateDraft,
  type OwnerCreateFulfilmentMethod,
} from "@/engines/orders/fulfilment";
import type { PaidAddonMutationPayload } from "@/engines/orders/paid-addons";
import { createClient } from "@/lib/supabase/server";
import { isStaffGuestOrderSource } from "@/workspaces/owner/orders/labels";
import type { StaffPreorderFormItem } from "@/workspaces/owner/orders/staff-preorder-form";
import { listOfferableLibraryCakes } from "@/workspaces/storefront/catalog/queries";

export type CreateStaffGuestPreorderInput = {
  actorStaffId: string;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  orderSource: string;
  crewOrder?: boolean;
  pickupDate: string;
  pickupTime: string;
  items: StaffPreorderFormItem[];
  complimentary?: Array<{
    type_id: string | null;
    name: string;
    quantity: number;
    sort_order: number;
  }>;
  paidAddons?: PaidAddonMutationPayload[];
  includeReceipt?: boolean;
  needsBakeryAttention?: boolean;
  bakeryAttentionNote?: string | null;
  customerNotes: string | null;
  internalNotes: string | null;
  fulfilmentMethod: OwnerCreateFulfilmentMethod | CustomerWebsiteFulfilmentMethod;
  delivery: DeliveryCreateDraft;
  /**
   * Default `owner-clock` is an Owner-authorized exception: any valid clock
   * time, including times outside customer slots. Manager / Customer Operations
   * staff must pass `customer-slots`. Owner on the assisted form may pass
   * `owner-clock` only for an explicit special arrangement.
   */
  slotPolicy?: "owner-clock" | "customer-slots";
  dineIn?: AssistedDineInDraft;
  closedDates?: readonly string[];
  hoursSnapshot?: OperatingHoursSnapshot;
};

export async function createStaffGuestPreorderRecord(
  input: CreateStaffGuestPreorderInput,
): Promise<{ orderId: string } | { error: string }> {
  const guestName = input.guestName.trim();
  if (!guestName) {
    return { error: "Please enter the customer name." };
  }
  if (!isStaffGuestOrderSource(input.orderSource)) {
    return { error: "Please choose a valid order source." };
  }
  if (
    input.guestEmail &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.guestEmail)
  ) {
    return {
      error: "Please enter a valid email address, or leave email blank.",
    };
  }

  const slotPolicy = input.slotPolicy ?? "owner-clock";
  const dineIn = input.dineIn ?? defaultAssistedDineInDraft();
  let fulfilmentRpc: {
    p_fulfilment_method: CustomerWebsiteFulfilmentMethod | OwnerCreateFulfilmentMethod;
    p_delivery: ReturnType<typeof buildCreateStaffFulfilmentRpcParams>["p_delivery"];
    p_dine_in?: ReturnType<typeof buildAssistedFulfilmentRpcParams>["p_dine_in"];
  };

  if (slotPolicy === "customer-slots") {
    const fulfilmentMethod = parseCustomerWebsiteFulfilmentMethod(
      input.fulfilmentMethod,
    );
    const fulfilmentError = validateAssistedOrderFulfilment({
      method: fulfilmentMethod,
      dateYmd: input.pickupDate,
      timeValue: input.pickupTime,
      delivery: input.delivery,
      dineIn,
      closedDates: input.closedDates,
      hoursSnapshot: input.hoursSnapshot ?? OPERATING_HOURS_SEED,
    });
    if (fulfilmentError) {
      return { error: fulfilmentError };
    }
    fulfilmentRpc = buildAssistedFulfilmentRpcParams({
      method: fulfilmentMethod,
      delivery: input.delivery,
      dineIn,
    });
  } else {
    const websiteMethod = parseCustomerWebsiteFulfilmentMethod(
      input.fulfilmentMethod,
    );
    if (websiteMethod === "dine_in") {
      const fulfilmentError = validateAssistedOwnerOverrideFulfilment({
        method: "dine_in",
        dateYmd: input.pickupDate,
        timeValue: input.pickupTime,
        delivery: input.delivery,
        dineIn,
        hoursSnapshot: input.hoursSnapshot ?? OPERATING_HOURS_SEED,
      });
      if (fulfilmentError) {
        return { error: fulfilmentError };
      }
      fulfilmentRpc = buildAssistedFulfilmentRpcParams({
        method: "dine_in",
        delivery: input.delivery,
        dineIn,
      });
    } else {
      const fulfilmentMethod = normalizeOwnerCreateFulfilmentMethod(
        input.fulfilmentMethod,
      );
      const fulfilmentError = validateOwnerCreateFulfilment({
        method: fulfilmentMethod,
        pickupDate: input.pickupDate,
        pickupTime: input.pickupTime,
        delivery: input.delivery,
      });
      if (fulfilmentError) {
        return { error: fulfilmentError };
      }
      if (!isValidClockPickupTime(input.pickupTime)) {
        return {
          error:
            fulfilmentMethod === "delivery"
              ? "Please enter a valid delivery clock time."
              : "Please enter a valid pickup clock time.",
        };
      }
      fulfilmentRpc = buildCreateStaffFulfilmentRpcParams({
        method: fulfilmentMethod,
        delivery: input.delivery,
      });
    }
  }
  if (input.items.length === 0) {
    return { error: "Please add at least one cake." };
  }

  const cakes = await listOfferableLibraryCakes();
  for (const draft of input.items) {
    const cake = cakes.find((entry) => entry.id === draft.cakeId);
    if (!cake) {
      return {
        error: "One of the cakes is not available in the Library.",
      };
    }
    const size = cake.sizes.find((entry) => entry.id === draft.cakeSizeId);
    if (!size) {
      return {
        error: `Please choose a valid size for ${cake.name}.`,
      };
    }
  }

  const supabase = await createClient();
  const rpcArgs: Record<string, unknown> = {
    p_actor_staff_id: input.actorStaffId,
    p_customer_name: guestName,
    p_phone: input.guestPhone,
    p_email: input.guestEmail,
    p_order_source: input.orderSource,
    p_crew_order: Boolean(input.crewOrder),
    p_pickup_date: input.pickupDate,
    p_pickup_time: input.pickupTime,
    p_pickup_instruction: null,
    p_items: input.items.map((item) => ({
      cake_id: item.cakeId,
      cake_size_id: item.cakeSizeId,
      quantity: item.quantity,
    })),
    p_complimentary: input.complimentary ?? [],
    p_paid_addons: input.paidAddons ?? [],
    p_include_receipt: Boolean(input.includeReceipt),
    p_needs_bakery_attention: Boolean(input.needsBakeryAttention),
    p_bakery_attention_note: input.needsBakeryAttention
      ? input.bakeryAttentionNote
      : null,
    p_customer_notes: input.customerNotes,
    p_internal_notes: input.internalNotes,
    p_fulfilment_method: fulfilmentRpc.p_fulfilment_method,
    p_delivery: fulfilmentRpc.p_delivery,
  };
  if (fulfilmentRpc.p_fulfilment_method === "dine_in") {
    rpcArgs.p_dine_in = fulfilmentRpc.p_dine_in;
  }

  const { data, error } = await supabase.rpc(
    "create_staff_guest_preorder",
    rpcArgs,
  );

  if (error) {
    return { error: error.message };
  }

  const orderId =
    data && typeof data === "object" && "id" in data
      ? String((data as { id: string }).id)
      : null;
  if (!orderId) {
    return { error: "Order was created but could not be opened." };
  }

  return { orderId };
}
