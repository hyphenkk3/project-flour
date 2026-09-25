"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { requireStaff } from "@/foundation/auth/session";
import { evaluateCatalogueVoucherEligibility } from "@/engines/vouchers/catalogue-voucher";
import { catalogueEligibilityInputFromOrder } from "@/engines/vouchers/catalogue-voucher-context";
import { singaporeDateFromIso } from "@/engines/orders/promotions";
import { CATALOGUE_VOUCHER_ADJUSTMENT_CODE } from "@/types/catalogue-voucher";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  guestPreorderReceiptAuthorized,
  GUEST_PREORDER_RECEIPT_COOKIE,
} from "@/workspaces/storefront/checkout/receipt";
import {
  getCatalogueVoucherForApply,
  listPublicCatalogueVouchers,
  listStaffCatalogueVouchers,
  loadCatalogueApplyOrder,
} from "@/workspaces/vouchers/catalogue-queries";
import {
  createPerfCorrelationId,
  getPerfContext,
  logPerf,
  logPerfSkipped,
  runWithPerfContext,
} from "@/lib/perf/dev-only-server";

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

  const [order, voucher] = await Promise.all([
    (async () => {
      const started = performance.now();
      const loaded = await loadCatalogueApplyOrder(input.orderId);
      if (getPerfContext()) {
        logPerf(
          "CHECKOUT_VOUCHER",
          "loadCatalogueApplyOrder",
          performance.now() - started,
        );
      }
      return loaded;
    })(),
    (async () => {
      const started = performance.now();
      const loaded = await getCatalogueVoucherForApply(input.voucherId);
      if (getPerfContext()) {
        logPerf(
          "CHECKOUT_VOUCHER",
          "getCatalogueVoucherForApply",
          performance.now() - started,
        );
      }
      return loaded;
    })(),
  ]);
  if (!order) {
    return { error: "Order not found." };
  }
  if (!voucher) {
    return { error: "Voucher not found." };
  }

  const applied = order.adjustments.find(
    (row) =>
      row.code === CATALOGUE_VOUCHER_ADJUSTMENT_CODE &&
      (row.status ?? "active") === "active" &&
      !row.reversesAdjustmentId,
  );
  if (applied) {
    const appliedId =
      applied.metadata && typeof applied.metadata.voucher_id === "string"
        ? applied.metadata.voucher_id
        : null;
    if (appliedId === input.voucherId || applied.label === voucher.code) {
      if (getPerfContext()) {
        logPerfSkipped("CHECKOUT_VOUCHER", "eligibility_evaluation");
        logPerfSkipped(
          "CHECKOUT_VOUCHER",
          "apply_catalogue_voucher_to_guest_order",
        );
      }
      return { error: null };
    }
    return { error: "A catalogue voucher is already applied to this order." };
  }

  const today = singaporeDateFromIso(new Date().toISOString());
  const eligibilityStarted = performance.now();
  const result = evaluateCatalogueVoucherEligibility(
    voucher,
    catalogueEligibilityInputFromOrder(order, today),
  );
  if (getPerfContext()) {
    logPerf(
      "CHECKOUT_VOUCHER",
      "eligibility_evaluation",
      performance.now() - eligibilityStarted,
    );
  }
  if (!result.eligible) {
    return { error: result.reason ?? "This voucher cannot be applied." };
  }

  const admin = createServiceClient();
  const rpcStarted = performance.now();
  const { error } = await admin.rpc("apply_catalogue_voucher_to_guest_order", {
    p_order_id: input.orderId,
    p_voucher_id: input.voucherId,
    p_actor_staff_id: input.actorStaffId,
  });
  if (getPerfContext()) {
    logPerf(
      "CHECKOUT_VOUCHER",
      "apply_catalogue_voucher_to_guest_order",
      performance.now() - rpcStarted,
    );
  }
  if (error) {
    if (/already applied/i.test(error.message)) {
      const current = await loadCatalogueApplyOrder(input.orderId);
      const currentApplied = current?.adjustments.find(
        (row) =>
          row.code === CATALOGUE_VOUCHER_ADJUSTMENT_CODE &&
          (row.status ?? "active") === "active" &&
          !row.reversesAdjustmentId,
      );
      const currentId =
        currentApplied?.metadata &&
        typeof currentApplied.metadata.voucher_id === "string"
          ? currentApplied.metadata.voucher_id
          : null;
      if (
        currentApplied &&
        (currentId === input.voucherId || currentApplied.label === voucher.code)
      ) {
        return { error: null };
      }
    }
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
  const existing = getPerfContext();
  const correlationId = existing?.correlationId ?? createPerfCorrelationId();
  return runWithPerfContext(
    {
      correlationId,
      source: existing?.source ?? "voucher_apply",
    },
    () =>
      applyGuestCatalogueVoucherActionTimed(orderId, voucherId, clientAmount),
  );
}

async function applyGuestCatalogueVoucherActionTimed(
  orderId: string,
  voucherId: string,
  clientAmount?: number | null,
): Promise<{ error: string | null }> {
  const totalStarted = performance.now();
  logPerf("CHECKOUT_VOUCHER", "action_start", 0, { voucherApply: "executed" });
  try {
    const cookieStarted = performance.now();
    const store = await cookies();
    const cookieOrderId =
      store.get(GUEST_PREORDER_RECEIPT_COOKIE)?.value ?? null;
    const authorized = guestPreorderReceiptAuthorized(orderId, cookieOrderId);
    logPerf(
      "CHECKOUT_VOUCHER",
      "receipt_cookie_auth",
      performance.now() - cookieStarted,
    );
    if (!authorized) {
      return { error: "This order is not available for voucher application." };
    }
    logPerfSkipped("CHECKOUT_VOUCHER", "getGuestPreorderReceipt");

    const result = await applyCatalogueVoucherAuthoritative({
      orderId,
      voucherId,
      actorStaffId: null,
      clientAmount,
    });
    if (result.error === "Order not found.") {
      return { error: "This order is not available for voucher application." };
    }
    logPerfSkipped("CHECKOUT_VOUCHER", "revalidatePath");
    return result;
  } finally {
    logPerf("CHECKOUT_VOUCHER", "TOTAL", performance.now() - totalStarted);
  }
}
