import { createServiceClient } from "@/lib/supabase/admin";
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
