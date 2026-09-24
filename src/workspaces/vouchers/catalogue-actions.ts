"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { requireStaff } from "@/foundation/auth/session";
import { evaluateCatalogueVoucherEligibility } from "@/engines/vouchers/catalogue-voucher";
import { catalogueEligibilityInputFromOrder } from "@/engines/vouchers/catalogue-voucher-context";
import { singaporeDateFromIso } from "@/engines/orders/promotions";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  getGuestPreorderReceipt,
  guestPreorderReceiptAuthorized,
  GUEST_PREORDER_RECEIPT_COOKIE,
} from "@/workspaces/storefront/checkout/receipt";
import {
  getCatalogueVoucherForApply,
  listPublicCatalogueVouchers,
  listStaffCatalogueVouchers,
  loadCatalogueApplyOrder,
} from "@/workspaces/vouchers/catalogue-queries";

async function requireDiscountStaff() {
  const staff = await requireStaff();
  if (
    staff.role.code !== "owner" &&
    staff.role.code !== "manager" &&
    staff.role.code !== "customer_operations"
  ) {
    throw new Error("Not authorized to apply catalogue vouchers.");
  }
  return staff;
}

export async function applyCatalogueVoucherAuthoritative(input: {
  orderId: string;
  voucherId: string;
  actorStaffId: string | null;
  clientAmount?: number | null;
}): Promise<{ error: string | null }> {
  if (input.clientAmount != null) {
    return { error: "Client-provided discount amounts are not accepted." };
  }

  const order = await loadCatalogueApplyOrder(input.orderId);
  if (!order) {
    return { error: "Order not found." };
  }

  const voucher = await getCatalogueVoucherForApply(input.voucherId);
  if (!voucher) {
    return { error: "Voucher not found." };
  }

  const today = singaporeDateFromIso(new Date().toISOString());
  const result = evaluateCatalogueVoucherEligibility(
    voucher,
    catalogueEligibilityInputFromOrder(order, today),
  );
  if (!result.eligible) {
    return { error: result.reason ?? "This voucher cannot be applied." };
  }

  const admin = createServiceClient();
  const { error } = await admin.rpc("apply_catalogue_voucher_to_guest_order", {
    p_order_id: input.orderId,
    p_voucher_id: input.voucherId,
    p_actor_staff_id: input.actorStaffId,
  });
  if (error) {
    return { error: error.message };
  }
  return { error: null };
}

export async function listPublicCatalogueVouchersAction() {
  return listPublicCatalogueVouchers();
}

export async function listStaffCatalogueVouchersAction() {
  await requireDiscountStaff();
  return listStaffCatalogueVouchers();
}

export async function applyStaffCatalogueVoucherAction(
  orderId: string,
  voucherId: string,
  clientAmount?: number | null,
): Promise<{ error: string | null }> {
  const staff = await requireDiscountStaff();
  const result = await applyCatalogueVoucherAuthoritative({
    orderId,
    voucherId,
    actorStaffId: staff.id,
    clientAmount,
  });
  if (result.error) return result;
  revalidatePath("/owner");
  revalidatePath(`/owner/orders/${orderId}`);
  revalidatePath(`/owner/orders/${orderId}/payment`);
  return { error: null };
}

export async function applyGuestCatalogueVoucherAction(
  orderId: string,
  voucherId: string,
  clientAmount?: number | null,
): Promise<{ error: string | null }> {
  const store = await cookies();
  const cookieOrderId = store.get(GUEST_PREORDER_RECEIPT_COOKIE)?.value ?? null;
  if (!guestPreorderReceiptAuthorized(orderId, cookieOrderId)) {
    return { error: "This order is not available for voucher application." };
  }
  const receipt = await getGuestPreorderReceipt(orderId, cookieOrderId);
  if (!receipt) {
    return { error: "This order is not available for voucher application." };
  }

  const result = await applyCatalogueVoucherAuthoritative({
    orderId,
    voucherId,
    actorStaffId: null,
    clientAmount,
  });
  if (!result.error) {
    revalidatePath("/order/success");
  }
  return result;
}
