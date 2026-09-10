/**
 * Staff collection-date guard for duplicate / date-change.
 * Reuses customer preorder evaluation (lead, closure, operating hours, capacity).
 */

import { customerFulfilmentAvailability } from "@/engines/orders/customer-fulfilment-availability";
import {
  customerCollectionDateMessage,
  evaluateCollectionDate,
} from "@/engines/preorder/validate";
import {
  preorderCartLineId,
  readPreorderDays,
} from "@/engines/preorder/lead";
import { loadMalaysiaPreorderBusinessDate } from "@/engines/preorder/server";
import { isPickupOrdersClosed } from "@/engines/business-calendar/order-availability";
import { normalizeFulfilmentMethod } from "@/engines/orders/fulfilment";
import { loadOperatingHoursSnapshot } from "@/workspaces/library/operating-hours/queries";
import { loadCustomerCartDateCapacity } from "@/workspaces/storefront/checkout/capacity-availability";
import { listClosedPickupOrderDates } from "@/workspaces/storefront/checkout/order-availability";
import {
  getAvailableCakeById,
  listOfferableLibraryCakes,
} from "@/workspaces/storefront/catalog/queries";
import { createClient } from "@/lib/supabase/server";
import {
  PENDING_PREORDER_EXCEPTION_BLOCKS_DATE_MESSAGE,
  approvedPreorderExceptionPermitsDate,
} from "@/engines/operations/preorder-lead-time-exception";
import { parseOperationsApprovalPayload } from "@/engines/operations/approvals";

export async function assertStaffCollectionDateAllowed(input: {
  pickupDate: string;
  fulfilmentMethod: string | null | undefined;
  collectionId?: string | null;
  orderId?: string | null;
  items: Array<{
    cakeId: string;
    cakeSizeId: string;
    quantity: number;
    cakeName?: string;
    sizeLabel?: string;
  }>;
}): Promise<{ error: string | null }> {
  const pickupDate = input.pickupDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pickupDate)) {
    return { error: "Please choose a valid collection date." };
  }
  if (input.items.length === 0) {
    return { error: "Please keep at least one cake on the order." };
  }

  const supabase = await createClient();
  const [businessDate, hoursSnapshot, closedDates, cakes] = await Promise.all([
    loadMalaysiaPreorderBusinessDate(supabase),
    loadOperatingHoursSnapshot(),
    listClosedPickupOrderDates(pickupDate, pickupDate),
    listOfferableLibraryCakes(),
  ]);

  const lines = [];
  for (const item of input.items) {
    let cake = cakes.find((entry) => entry.id === item.cakeId) ?? null;
    if (!cake) {
      cake = await getAvailableCakeById(item.cakeId);
    }
    if (!cake) {
      return {
        error: "One of the cakes is no longer available in the Library.",
      };
    }
    const size = cake.sizes.find((entry) => entry.id === item.cakeSizeId);
    if (!size) {
      return {
        error: `Please choose a valid size for ${cake.name}.`,
      };
    }
    lines.push({
      lineId: preorderCartLineId(cake.id, size.id),
      cakeId: cake.id,
      cakeSizeId: size.id,
      cakeName: cake.name,
      sizeLabel: size.size,
      quantity: item.quantity,
      preorderDays: readPreorderDays(size.preorderDays),
    });
  }

  const method = normalizeFulfilmentMethod(input.fulfilmentMethod);
  const availability = customerFulfilmentAvailability(
    pickupDate,
    closedDates,
    hoursSnapshot,
  );
  const methodAvailability =
    method === "delivery"
      ? availability.delivery
      : method === "dine_in"
        ? availability.dine_in
        : availability.pickup;

  const capacitySnapshot = await loadCustomerCartDateCapacity({
    fromYmd: pickupDate,
    toYmd: pickupDate,
    collectionId: input.collectionId ?? null,
    cart: lines.map((line) => ({
      cakeId: line.cakeId,
      cakeSizeId: line.cakeSizeId,
      cakeName: line.cakeName,
      quantity: line.quantity,
    })),
  });
  const waitingListOffered =
    capacitySnapshot.waitingListDates?.includes(pickupDate) ?? false;
  const capacity = capacitySnapshot.fullyBookedDates.includes(pickupDate)
    ? {
        fullyBooked: true as const,
        waitingListEnabled: waitingListOffered,
        blockingCakeNames:
          capacitySnapshot.blockingCakeNamesByDate[pickupDate] ?? [],
        selectedYmd: pickupDate,
        nextAvailableYmd: null,
      }
    : null;

  const evaluation = evaluateCollectionDate({
    selectedYmd: pickupDate,
    businessDate,
    lines,
    operatingOpen: methodAvailability.available,
    closed: isPickupOrdersClosed(pickupDate, closedDates),
    inCatalogue: true,
    capacity,
  });

  if (!evaluation.valid) {
    if (evaluation.reason.code === "before_preorder" && input.orderId) {
      const exception = await loadPreorderExceptionForDate(
        input.orderId,
        pickupDate,
      );
      if (exception === "approved") {
        return { error: null };
      }
      if (exception === "pending") {
        return { error: PENDING_PREORDER_EXCEPTION_BLOCKS_DATE_MESSAGE };
      }
    }
    const detail =
      customerCollectionDateMessage(evaluation, lines) ??
      "This collection date is not available for this order.";
    const staffDetail = staffCollectionDateMessage(detail);
    if (evaluation.reason.code === "before_preorder") {
      return {
        error: `Preorder exception required. ${staffDetail}`,
      };
    }
    return {
      error: staffDetail,
    };
  }

  return { error: null };
}

async function loadPreorderExceptionForDate(
  orderId: string,
  pickupDate: string,
): Promise<"approved" | "pending" | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("operations_approval_requests")
    .select("status, payload")
    .eq("order_id", orderId)
    .eq("request_type", "preorder_lead_time_exception")
    .in("status", ["pending", "approved"]);
  if (error || !data) return null;

  let pending = false;
  for (const row of data) {
    const payload = parseOperationsApprovalPayload(
      "preorder_lead_time_exception",
      row.payload,
    );
    const requested =
      payload?.kind === "preorder_lead_time_exception"
        ? payload.requestedPickupDate
        : null;
    if (requested !== pickupDate) continue;
    if (
      approvedPreorderExceptionPermitsDate({
        status: row.status === "approved" ? "approved" : "pending",
        requestedPickupDate: requested,
        pickupDate,
      })
    ) {
      return "approved";
    }
    if (row.status === "pending") pending = true;
  }
  return pending ? "pending" : null;
}

function staffCollectionDateMessage(customerMessage: string): string {
  return customerMessage
    .replace(/^Your selected date/, "This collection date")
    .replace(/\byour order\b/g, "this order")
    .replace(/\byour current order\b/g, "this order");
}
