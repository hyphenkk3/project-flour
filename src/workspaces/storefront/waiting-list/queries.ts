import { createServiceClient } from "@/lib/supabase/admin";
import { parseBusinessDate } from "@/lib/dates";
import { customerWaitingListOptionsForDate } from "@/engines/waiting-list/eligibility";
import type { GuestCapacityRow } from "@/engines/preorder/capacity";
import {
  getStorefrontCollectionForPickupDate,
  listAvailableCakes,
} from "@/workspaces/storefront/catalog/queries";
import { storefrontPhotoForSize } from "@/workspaces/storefront/catalog/cake-photo-map";
import { isPickupOrdersClosed } from "@/workspaces/storefront/checkout/order-availability";
import type { CustomerWaitingListAvailability } from "@/workspaces/storefront/waiting-list/availability-types";
import { guestWaitingListCookieId } from "@/workspaces/storefront/waiting-list/cookie";

export type GuestWaitingListAckItem = {
  id: string;
  cakeName: string;
  sizeLabel: string;
  quantity: number;
  remainingQuantity: number;
  status: string;
};

export type GuestWaitingListAck = {
  id: string;
  guestName: string;
  guestPhone: string;
  pickupDate: string;
  openToAlternatives: boolean;
  status: string;
  items: GuestWaitingListAckItem[];
};

export async function getGuestWaitingListAck(
  requestId: string,
): Promise<GuestWaitingListAck | null> {
  const id = requestId.trim();
  const cookieId = await guestWaitingListCookieId();
  if (!id || cookieId !== id) return null;

  try {
    const admin = createServiceClient();
    const { data: request, error } = await admin
      .from("waiting_list_requests")
      .select("id, guest_name, guest_phone, pickup_date, open_to_alternatives, status")
      .eq("id", id)
      .maybeSingle();
    if (error || !request) return null;
    const { data: items } = await admin
      .from("waiting_list_items")
      .select(
        "id, quantity, remaining_quantity, status, library_cake_id, library_cake_size_id",
      )
      .eq("request_id", id);
    const cakeIds = [
      ...new Set(
        (items ?? []).map((row) =>
          String((row as { library_cake_id?: string }).library_cake_id ?? ""),
        ),
      ),
    ].filter(Boolean);
    const sizeIds = [
      ...new Set(
        (items ?? []).map((row) =>
          String(
            (row as { library_cake_size_id?: string | null })
              .library_cake_size_id ?? "",
          ),
        ),
      ),
    ].filter(Boolean);
    const cakeNames = new Map<string, string>();
    const sizeLabels = new Map<string, string>();
    if (cakeIds.length > 0) {
      const { data: cakes } = await admin
        .from("library_cakes")
        .select("id, name")
        .in("id", cakeIds);
      for (const cake of cakes ?? []) {
        cakeNames.set(
          String((cake as { id?: string }).id ?? ""),
          String((cake as { name?: string }).name ?? "Cake"),
        );
      }
    }
    if (sizeIds.length > 0) {
      const { data: sizes } = await admin
        .from("library_cake_sizes")
        .select("id, label")
        .in("id", sizeIds);
      for (const size of sizes ?? []) {
        sizeLabels.set(
          String((size as { id?: string }).id ?? ""),
          String((size as { label?: string }).label ?? "Size"),
        );
      }
    }
    return {
      id: String((request as { id?: string }).id ?? ""),
      guestName: String((request as { guest_name?: string }).guest_name ?? ""),
      guestPhone: String((request as { guest_phone?: string }).guest_phone ?? ""),
      pickupDate: String(
        (request as { pickup_date?: string }).pickup_date ?? "",
      ).slice(0, 10),
      openToAlternatives: Boolean(
        (request as { open_to_alternatives?: boolean }).open_to_alternatives,
      ),
      status: String((request as { status?: string }).status ?? ""),
      items: (items ?? []).map((row) => {
        const cakeId = String(
          (row as { library_cake_id?: string }).library_cake_id ?? "",
        );
        const sizeId = String(
          (row as { library_cake_size_id?: string | null }).library_cake_size_id ??
            "",
        );
        return {
          id: String((row as { id?: string }).id ?? ""),
          cakeName: cakeNames.get(cakeId) ?? "Cake",
          sizeLabel: sizeLabels.get(sizeId) ?? "Size",
          quantity: Number((row as { quantity?: number }).quantity ?? 0),
          remainingQuantity: Number(
            (row as { remaining_quantity?: number }).remaining_quantity ?? 0,
          ),
          status: String((row as { status?: string }).status ?? ""),
        };
      }),
    };
  } catch {
    return null;
  }
}

function emptyWaitingListAvailability(
  pickupDate: string,
  collectionId: string | null = null,
): CustomerWaitingListAvailability {
  return { pickupDate, collectionId, options: [] };
}

function isMissingWaitingListRelation(message: string): boolean {
  return /production_capacity|waiting_list|schema cache|does not exist/i.test(
    message,
  );
}

/**
 * Closed-date customer Waiting List options for one pickup date.
 * Open dates return no options — discovery is closed-date only.
 * Does not expose capacity quantities.
 */
export async function listCustomerWaitingListAvailability(
  pickupDate: string,
): Promise<CustomerWaitingListAvailability> {
  const key = pickupDate.trim().slice(0, 10);
  if (!parseBusinessDate(key)) return emptyWaitingListAvailability("");
  try {
    const closed = await isPickupOrdersClosed(key);
    if (!closed) return emptyWaitingListAvailability(key);

    const collection = await getStorefrontCollectionForPickupDate(key);
    if (!collection) return emptyWaitingListAvailability(key);

    const admin = createServiceClient();
    const { data: collectionRow, error: collectionError } = await admin
      .from("collections")
      .select("waiting_list_enabled")
      .eq("id", collection.id)
      .maybeSingle();
    if (collectionError) {
      if (isMissingWaitingListRelation(collectionError.message)) {
        return emptyWaitingListAvailability(key, collection.id);
      }
      throw new Error(collectionError.message);
    }
    const collectionWaitingListEnabled = Boolean(
      (collectionRow as { waiting_list_enabled?: boolean } | null)
        ?.waiting_list_enabled,
    );
    if (!collectionWaitingListEnabled) {
      return emptyWaitingListAvailability(key, collection.id);
    }

    const cakes = await listAvailableCakes(collection.id);
    const cakeIds = cakes.map((cake) => cake.id);
    if (cakeIds.length === 0) {
      return emptyWaitingListAvailability(key, collection.id);
    }

    let { data: capacityData, error: capacityError } = await admin
      .from("production_capacity")
      .select(
        "pickup_date, library_cake_id, library_cake_size_id, collection_id, capacity_quantity, waiting_list_enabled",
      )
      .eq("pickup_date", key)
      .in("library_cake_id", cakeIds);

    if (capacityError && /waiting_list_enabled/i.test(capacityError.message)) {
      const fallback = await admin
        .from("production_capacity")
        .select(
          "pickup_date, library_cake_id, library_cake_size_id, collection_id, capacity_quantity",
        )
        .eq("pickup_date", key)
        .in("library_cake_id", cakeIds);
      capacityData = fallback.data as typeof capacityData;
      capacityError = fallback.error;
    }
    if (capacityError) {
      if (isMissingWaitingListRelation(capacityError.message)) {
        return emptyWaitingListAvailability(key, collection.id);
      }
      throw new Error(capacityError.message);
    }

    const rows: GuestCapacityRow[] = (capacityData ?? []).map((row) => ({
      pickupDate: String(
        (row as { pickup_date?: string }).pickup_date ?? "",
      ).slice(0, 10),
      cakeId: String((row as { library_cake_id?: string }).library_cake_id ?? ""),
      sizeId: String(
        (row as { library_cake_size_id?: string | null }).library_cake_size_id ??
          "",
      ).trim()
        ? String(
            (row as { library_cake_size_id?: string | null })
              .library_cake_size_id,
          )
        : null,
      collectionId: String(
        (row as { collection_id?: string | null }).collection_id ?? "",
      ).trim()
        ? String((row as { collection_id?: string | null }).collection_id)
        : null,
      capacityQuantity: Number(
        (row as { capacity_quantity?: number }).capacity_quantity ?? 0,
      ),
      waitingListEnabled: Boolean(
        (row as { waiting_list_enabled?: boolean }).waiting_list_enabled,
      ),
    }));

    const sizes = cakes.flatMap((cake) =>
      cake.sizes.map((size) => ({
        cakeId: cake.id,
        cakeName: cake.name,
        sizeId: size.id,
        sizeLabel: size.size,
        price: size.price,
      })),
    );
    const eligible = customerWaitingListOptionsForDate({
      pickupDate: key,
      collectionId: collection.id,
      ordersClosed: true,
      collectionWaitingListEnabled: true,
      sizes,
      rows,
    });
    const cakeById = new Map(cakes.map((cake) => [cake.id, cake]));
    return {
      pickupDate: key,
      collectionId: collection.id,
      options: eligible.map((option) => {
        const cake = cakeById.get(option.cakeId);
        const photo = cake
          ? storefrontPhotoForSize(cake.photos, option.sizeId)
          : null;
        return {
          ...option,
          photoUrl: photo?.url ?? cake?.image ?? null,
          photoAlt: photo?.altText || cake?.name || option.cakeName,
        };
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (isMissingWaitingListRelation(message)) {
      return emptyWaitingListAvailability(key);
    }
    throw error;
  }
}
