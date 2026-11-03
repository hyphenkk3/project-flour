import { createClient } from "@/lib/supabase/server";
import {
  evaluateGuestCartDateCapacity,
  type GuestCapacityCartLine,
  type GuestCapacityRow,
  type GuestCapacityUsedLine,
} from "@/engines/preorder/capacity";
import { GUEST_PREORDER_CAPACITY_ORDER_STATUSES } from "@/engines/preorder/capacity";
import { parseBusinessDate } from "@/lib/dates";
import {
  classifyCapacityLookupError,
  getConfirmedZeroCapacityDates,
  isMissingRelation,
  isMissingWaitingListColumn,
  isExpectedAdvisoryPermissionDenial,
} from "@/workspaces/storefront/checkout/capacity-errors";

export type CustomerCartDateCapacitySnapshot = {
  availabilityConfirmed: boolean;
  showAdvisoryFailureNotice: boolean;
  fullyBookedDates: string[];
  waitingListDates: string[];
  blockingCakeNamesByDate: Record<string, string[]>;
  waitingListLineKeysByDate: Record<string, string[]>;
};

function asId(value: unknown): string {
  return String(value ?? "").trim();
}

function asOptionalId(value: unknown): string | null {
  const id = asId(value);
  return id.length > 0 ? id : null;
}

function emptySnapshot(
  availabilityConfirmed = true,
  showAdvisoryFailureNotice = false,
): CustomerCartDateCapacitySnapshot {
  return {
    availabilityConfirmed,
    showAdvisoryFailureNotice,
    fullyBookedDates: [],
    waitingListDates: [],
    blockingCakeNamesByDate: {},
    waitingListLineKeysByDate: {},
  };
}

function unconfirmedSnapshot(
  confirmedFullDates: string[] = [],
  showAdvisoryFailureNotice = true,
): CustomerCartDateCapacitySnapshot {
  return {
    ...emptySnapshot(false, showAdvisoryFailureNotice),
    fullyBookedDates: confirmedFullDates,
  };
}

/**
 * Batched cart-date Fully Booked lookup. Customer payload never includes
 * capacity, used, or remaining quantities.
 */
export async function loadCustomerCartDateCapacity(input: {
  fromYmd: string;
  toYmd: string;
  collectionId: string | null;
  cart: readonly GuestCapacityCartLine[];
}): Promise<CustomerCartDateCapacitySnapshot> {
  if (!parseBusinessDate(input.fromYmd) || !parseBusinessDate(input.toYmd)) {
    return emptySnapshot();
  }
  if (input.cart.length === 0) return emptySnapshot();

  const cakeIds = [
    ...new Set(input.cart.map((line) => line.cakeId).filter(Boolean)),
  ];
  if (cakeIds.length === 0) return emptySnapshot();

  const supabase = await createClient();
  let { data: capacityData, error: capacityError } = await supabase
    .from("production_capacity")
    .select(
      "pickup_date, library_cake_id, library_cake_size_id, collection_id, capacity_quantity, waiting_list_enabled",
    )
    .gte("pickup_date", input.fromYmd)
    .lte("pickup_date", input.toYmd)
    .in("library_cake_id", cakeIds);

  if (capacityError && isMissingWaitingListColumn(capacityError)) {
    const fallback = await supabase
      .from("production_capacity")
      .select(
        "pickup_date, library_cake_id, library_cake_size_id, collection_id, capacity_quantity",
      )
      .gte("pickup_date", input.fromYmd)
      .lte("pickup_date", input.toYmd)
      .in("library_cake_id", cakeIds);
    capacityData = fallback.data as typeof capacityData;
    capacityError = fallback.error;
  }

  if (capacityError) {
    if (
      classifyCapacityLookupError(capacityError, "production_capacity") ===
      "missing_relation"
    ) {
      return emptySnapshot();
    }
    return unconfirmedSnapshot(
      [],
      !isExpectedAdvisoryPermissionDenial(capacityError, "production_capacity"),
    );
  }

  const rows: GuestCapacityRow[] = (capacityData ?? []).map((row) => ({
    pickupDate: String(
      (row as { pickup_date?: string }).pickup_date ?? "",
    ).slice(0, 10),
    cakeId: asId((row as { library_cake_id?: string }).library_cake_id),
    sizeId: asOptionalId(
      (row as { library_cake_size_id?: string | null }).library_cake_size_id,
    ),
    collectionId: asOptionalId(
      (row as { collection_id?: string | null }).collection_id,
    ),
    capacityQuantity: Number(
      (row as { capacity_quantity?: number }).capacity_quantity ?? 0,
    ),
    waitingListEnabled: Boolean(
      (row as { waiting_list_enabled?: boolean }).waiting_list_enabled,
    ),
  }));

  if (rows.length === 0) return emptySnapshot();

  let collectionWaitingListEnabled = false;
  if (input.collectionId) {
    const collection = await supabase
      .from("collections")
      .select("waiting_list_enabled")
      .eq("id", input.collectionId)
      .maybeSingle();
    if (collection.error) {
      if (
        !isMissingWaitingListColumn(collection.error) &&
        !isMissingRelation(collection.error, "collections")
      ) {
        return unconfirmedSnapshot(
          getConfirmedZeroCapacityDates({
            rows,
            cart: input.cart,
            collectionId: input.collectionId,
          }),
        );
      }
    } else {
      collectionWaitingListEnabled = Boolean(
        (collection.data as { waiting_list_enabled?: boolean } | null)
          ?.waiting_list_enabled,
      );
    }
  }

  const { data: orders, error: orderError } = await supabase
    .from("orders")
    .select("id, pickup_date, collection_id, status")
    .in("status", [...GUEST_PREORDER_CAPACITY_ORDER_STATUSES])
    .gte("pickup_date", input.fromYmd)
    .lte("pickup_date", input.toYmd);

  if (orderError) {
    // Without orders we cannot calculate occupancy, even if the relation is
    // genuinely absent in this environment.
    return unconfirmedSnapshot(
      getConfirmedZeroCapacityDates({
        rows,
        cart: input.cart,
        collectionId: input.collectionId,
      }),
    );
  }

  const orderById = new Map<
    string,
    { pickupDate: string; collectionId: string | null; status: string }
  >();
  for (const order of orders ?? []) {
    const id = asId((order as { id?: string }).id);
    if (!id) continue;
    orderById.set(id, {
      pickupDate: String(
        (order as { pickup_date?: string }).pickup_date ?? "",
      ).slice(0, 10),
      collectionId: asOptionalId(
        (order as { collection_id?: string | null }).collection_id,
      ),
      status: String((order as { status?: string }).status ?? ""),
    });
  }

  let used: GuestCapacityUsedLine[] = [];
  if (orderById.size > 0) {
    const { data: items, error: itemError } = await supabase
      .from("order_items")
      .select("order_id, cake_id, cake_size_id, quantity")
      .in("order_id", [...orderById.keys()])
      .in("cake_id", cakeIds);
    if (itemError) {
      return unconfirmedSnapshot(
        getConfirmedZeroCapacityDates({
          rows,
          cart: input.cart,
          collectionId: input.collectionId,
        }),
      );
    }
    used = (items ?? []).flatMap((item) => {
      const order = orderById.get(asId((item as { order_id?: string }).order_id));
      const cakeId = asId((item as { cake_id?: string }).cake_id);
      if (!order || !cakeId) return [];
      return [
        {
          pickupDate: order.pickupDate,
          cakeId,
          sizeId: asOptionalId(
            (item as { cake_size_id?: string | null }).cake_size_id,
          ),
          collectionId: order.collectionId,
          quantity: Number((item as { quantity?: number }).quantity ?? 0),
          status: order.status,
        },
      ];
    });
  }

  const dates = [
    ...new Set(rows.map((row) => row.pickupDate).filter(Boolean)),
  ];
  const fullyBookedDates: string[] = [];
  const waitingListDates: string[] = [];
  const blockingCakeNamesByDate: Record<string, string[]> = {};
  const waitingListLineKeysByDate: Record<string, string[]> = {};
  for (const pickupDate of dates) {
    const view = evaluateGuestCartDateCapacity({
      pickupDate,
      collectionId: input.collectionId,
      cart: input.cart,
      rows,
      used,
      collectionWaitingListEnabled,
    });
    if (!view.fullyBooked) continue;
    fullyBookedDates.push(pickupDate);
    blockingCakeNamesByDate[pickupDate] = view.blockingCakeNames;
    if (view.waitingListEnabled) {
      waitingListDates.push(pickupDate);
      waitingListLineKeysByDate[pickupDate] = view.waitingListLineKeys;
    }
  }

  return {
    availabilityConfirmed: true,
    showAdvisoryFailureNotice: false,
    fullyBookedDates,
    waitingListDates,
    blockingCakeNamesByDate,
    waitingListLineKeysByDate,
  };
}
