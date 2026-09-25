"use server";

import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  attachReceiptItemPhotos,
  guestPreorderReceiptAuthorized,
  GUEST_PREORDER_RECEIPT_COOKIE,
  loadReceiptCakePhotos,
  type GuestPreorderReceiptItem,
} from "@/workspaces/storefront/checkout/receipt";

export type ReceiptPhotoItemInput = Pick<
  GuestPreorderReceiptItem,
  "key" | "cakeId" | "cakeSizeId" | "cakeName" | "sizeLabel" | "quantity" | "unitPrice"
>;

export async function loadGuestReceiptPhotosAction(
  orderId: string,
  items: ReceiptPhotoItemInput[],
): Promise<{
  items: GuestPreorderReceiptItem[] | null;
  elapsedMs: number;
}> {
  const started = performance.now();
  const store = await cookies();
  const cookieOrderId = store.get(GUEST_PREORDER_RECEIPT_COOKIE)?.value ?? null;
  if (!guestPreorderReceiptAuthorized(orderId, cookieOrderId)) {
    return { items: null, elapsedMs: Math.round(performance.now() - started) };
  }
  const cakeIds = [
    ...new Set(
      items
        .map((item) => item.cakeId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const supabase = createServiceClient();
  const photosByCake = await loadReceiptCakePhotos(supabase, cakeIds);
  return {
    items: attachReceiptItemPhotos(items, photosByCake),
    elapsedMs: Math.round(performance.now() - started),
  };
}
