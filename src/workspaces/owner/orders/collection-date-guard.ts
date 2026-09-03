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

export async function assertStaffCollectionDateAllowed(input: {
  pickupDate: string;
  fulfilmentMethod: string | null | undefined;
  collectionId?: string | null;
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
    const detail =
      customerCollectionDateMessage(evaluation, lines) ??
      "This collection date is not available for this order.";
    return {
      error: staffCollectionDateMessage(detail),
    };
  }

  return { error: null };
}

function staffCollectionDateMessage(customerMessage: string): string {
  return customerMessage
    .replace(/^Your selected date/, "This collection date")
    .replace(/\byour order\b/g, "this order")
    .replace(/\byour current order\b/g, "this order");
}
