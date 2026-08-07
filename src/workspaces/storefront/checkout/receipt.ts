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
  total: number;
};

/**
 * Thank-you page receipt for a just-submitted guest preorder.
 * Uses service role so anon customers can see their own recap by order id.
 */
export async function getGuestPreorderReceipt(
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
        customer_id,
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

    return {
      items,
      pickupDate: String(data.pickup_date),
      pickupTime: String(data.pickup_time),
      total: calculateOrderTotal(
        items.map((item) => ({
          unitPrice: item.unitPrice ?? 0,
          quantity: item.quantity,
        })),
      ),
    };
  } catch {
    return null;
  }
}
