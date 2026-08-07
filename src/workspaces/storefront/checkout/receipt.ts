import { createServiceClient } from "@/lib/supabase/admin";

export type GuestPreorderReceipt = {
  cakeName: string;
  sizeLabel: string;
  unitPrice: number | null;
  pickupDate: string;
  pickupTime: string;
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
          unit_price,
          library_cakes ( name ),
          library_cake_sizes ( label )
        )
      `,
      )
      .eq("id", orderId)
      .is("customer_id", null)
      .maybeSingle();

    if (error || !data) return null;

    const items = Array.isArray(data.order_items) ? data.order_items : [];
    const first = items[0] as
      | {
          unit_price?: number | string | null;
          library_cakes?: { name: string } | { name: string }[] | null;
          library_cake_sizes?: { label: string } | { label: string }[] | null;
        }
      | undefined;

    const cakeRel = first?.library_cakes;
    const sizeRel = first?.library_cake_sizes;
    const cake = Array.isArray(cakeRel) ? cakeRel[0] : cakeRel;
    const size = Array.isArray(sizeRel) ? sizeRel[0] : sizeRel;

    return {
      cakeName: cake?.name ?? "Cake",
      sizeLabel: size?.label ?? "Size",
      unitPrice:
        first?.unit_price == null ? null : Number(first.unit_price),
      pickupDate: String(data.pickup_date),
      pickupTime: String(data.pickup_time),
    };
  } catch {
    return null;
  }
}
