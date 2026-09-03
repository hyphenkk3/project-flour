import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/admin";
import { calculateOrderTotal } from "@/engines/orders/totals";

export type GuestPreorderReceiptItem = {
  key: string;
  cakeName: string;
  sizeLabel: string;
  quantity: number;
  unitPrice: number | null;
};

export type GuestPreorderReceipt = {
  items: GuestPreorderReceiptItem[];
  pickupDate: string;
  pickupTime: string;
  fulfilmentMethod: "pickup" | "dine_in" | "delivery";
  guestCount: number | null;
  dineInVenue: "hyphen" | "whitebird" | null;
  reservationTime: string | null;
  total: number;
  /** True when this recap is a Fresh Picks Extra order, not a Whole Cake preorder. */
  isFreshPick: boolean;
};

/** httpOnly cookie bound to the just-submitted guest order. Path-scoped to /order. */
export const GUEST_PREORDER_RECEIPT_COOKIE = "wb_guest_preorder_receipt";
const RECEIPT_COOKIE_MAX_AGE_SECONDS = 60 * 60;

export function guestPreorderReceiptAuthorized(
  orderId: string,
  cookieOrderId: string | null | undefined,
): boolean {
  if (!orderId || !cookieOrderId) return false;
  return orderId === cookieOrderId;
}

export async function setGuestPreorderReceiptCookie(
  orderId: string,
): Promise<void> {
  const store = await cookies();
  store.set({
    name: GUEST_PREORDER_RECEIPT_COOKIE,
    value: orderId,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: RECEIPT_COOKIE_MAX_AGE_SECONDS,
    path: "/order",
  });
}

/**
 * Thank-you recap. Requires the submit cookie for `orderId`.
 * Never loads another guest order from a bare UUID.
 */
export async function getGuestPreorderReceipt(
  orderId: string,
  cookieOrderId?: string | null,
): Promise<GuestPreorderReceipt | null> {
  if (!orderId) return null;

  let allowed = cookieOrderId;
  if (allowed === undefined) {
    const store = await cookies();
    allowed = store.get(GUEST_PREORDER_RECEIPT_COOKIE)?.value ?? null;
  }
  if (!guestPreorderReceiptAuthorized(orderId, allowed)) {
    return null;
  }

  return loadGuestPreorderReceipt(orderId);
}

/**
 * Loads a guest preorder recap by id (no cookie check).
 * Used only after `guestPreorderReceiptAuthorized`.
 */
export async function loadGuestPreorderReceipt(
  orderId: string,
): Promise<GuestPreorderReceipt | null> {
  if (!orderId) return null;

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("orders")
      .select(
        `
        pickup_date,
        pickup_time,
        fulfilment_method,
        extra_stock_id,
        customer_id,
        order_dine_in_reservations ( guest_count, venue, reservation_time ),
        order_items (
          id,
          quantity,
          unit_price,
          cake_name,
          size_label,
          library_cakes ( name ),
          library_cake_sizes ( label )
        )
      `,
      )
      .eq("id", orderId)
      .is("customer_id", null)
      .maybeSingle();

    if (error || !data) return null;

    const rows = Array.isArray(data.order_items) ? data.order_items : [];
    const items: GuestPreorderReceiptItem[] = rows.map((row, index) => {
      const entry = row as {
        id?: string;
        quantity?: number;
        unit_price?: number | string | null;
        cake_name?: string | null;
        size_label?: string | null;
        library_cakes?: { name: string } | { name: string }[] | null;
        library_cake_sizes?: { label: string } | { label: string }[] | null;
      };
      const cakeRel = entry.library_cakes;
      const sizeRel = entry.library_cake_sizes;
      const cake = Array.isArray(cakeRel) ? cakeRel[0] : cakeRel;
      const size = Array.isArray(sizeRel) ? sizeRel[0] : sizeRel;
      const unitPrice =
        entry.unit_price == null ? null : Number(entry.unit_price);
      return {
        key: entry.id ?? String(index),
        cakeName: entry.cake_name ?? cake?.name ?? "Cake",
        sizeLabel: entry.size_label ?? size?.label ?? "Size",
        quantity: Number(entry.quantity ?? 1),
        unitPrice,
      };
    });

    const reservationRel = (
      data as {
        order_dine_in_reservations?:
          | {
              guest_count?: number | null;
              venue?: string | null;
              reservation_time?: string | null;
            }
          | {
              guest_count?: number | null;
              venue?: string | null;
              reservation_time?: string | null;
            }[]
          | null;
      }
    ).order_dine_in_reservations;
    const reservation = Array.isArray(reservationRel)
      ? reservationRel[0]
      : reservationRel;
    const methodRaw = String(
      (data as { fulfilment_method?: string | null }).fulfilment_method ?? "",
    );
    const fulfilmentMethod =
      methodRaw === "dine_in" || methodRaw === "delivery"
        ? methodRaw
        : "pickup";
    const guestCountRaw = Number(reservation?.guest_count);
    const venueRaw = String(reservation?.venue ?? "").trim().toLowerCase();
    const dineInVenue =
      venueRaw === "hyphen" || venueRaw === "whitebird" ? venueRaw : null;
    return {
      items,
      pickupDate: String(data.pickup_date),
      pickupTime: String(data.pickup_time),
      fulfilmentMethod,
      guestCount:
        fulfilmentMethod === "dine_in" && Number.isInteger(guestCountRaw)
          ? guestCountRaw
          : null,
      dineInVenue: fulfilmentMethod === "dine_in" ? dineInVenue : null,
      reservationTime:
        fulfilmentMethod === "dine_in"
          ? String(reservation?.reservation_time ?? "").slice(0, 5) || null
          : null,
      total: calculateOrderTotal(
        items.map((item) => ({
          unitPrice: item.unitPrice ?? 0,
          quantity: item.quantity,
        })),
      ),
      isFreshPick: Boolean(
        (data as { extra_stock_id?: string | null }).extra_stock_id,
      ),
    };
  } catch {
    return null;
  }
}
