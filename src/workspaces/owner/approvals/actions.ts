"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/foundation/auth/session";
import { scheduleStaffNotificationDispatch } from "@/foundation/staff/schedule-staff-notification-dispatch";
import {
  STALE_APPROVAL_MESSAGE,
  canCancelOperationsApproval,
  canRequestOperationsApprovalType,
  canReviewOperationsApprovalType,
  crossMonthPayloadToRpc,
  discountExceptionToRpcPayload,
  isOperationsApprovalStatus,
  isOperationsApprovalType,
  isWithinTwoDayChangeCutoff,
  lateOrderEditPayloadToRpc,
  preorderLeadTimeExceptionToRpc,
  requesterCannotDecideOwnRequest,
  requiresCrossMonthApproval,
  type CrossMonthPickupPayload,
  type DiscountExceptionPayload,
  type LateOrderEditPayload,
  type OperationsApprovalType,
  type PreorderLeadTimeExceptionPayload,
} from "@/engines/operations/approvals";
import { staffHasBakeryPreorderApprover } from "@/workspaces/owner/approvals/designations";
import {
  financialMateriallyAffectsConfirmation,
  orderStatusAllowsConfirmationInvalidation,
} from "@/engines/orders/confirmation-validity";
import { reconcilePaymentLifecycleStatus } from "@/engines/orders/payment-status";
import { createClient } from "@/lib/supabase/server";
import { getGuestOrderById } from "@/workspaces/owner/orders/queries";
import type { StorefrontOrder } from "@/types/storefront";

export type OperationsApprovalActionState = {
  error: string | null;
  success: boolean;
};

function rpcErrorMessage(error: { message: string } | null): string {
  const message = error?.message ?? "Something went wrong.";
  if (message.includes("stale")) return STALE_APPROVAL_MESSAGE;
  return message;
}

async function revalidateApprovalPaths(orderId: string) {
  revalidatePath("/owner");
  revalidatePath("/owner/approvals");
  revalidatePath("/owner/approvals/history");
  revalidatePath("/customer-operations/orders");
  revalidatePath("/home");
  revalidatePath("/bakery");
  revalidatePath(`/owner/orders/${orderId}`);
  revalidatePath(`/owner/orders/${orderId}/payment`);
  revalidatePath(`/owner/orders/${orderId}/confirmation`);
}

export async function createOperationsApprovalAction(input: {
  orderId: string;
  requestType: OperationsApprovalType;
  reason: string;
  payload:
    | DiscountExceptionPayload
    | CrossMonthPickupPayload
    | LateOrderEditPayload
    | PreorderLeadTimeExceptionPayload;
}): Promise<OperationsApprovalActionState> {
  const staff = await requireStaff();
  if (!isOperationsApprovalType(input.requestType)) {
    return { error: "Unsupported approval type.", success: false };
  }
  if (!canRequestOperationsApprovalType(staff.role.code, input.requestType)) {
    return {
      error: "Not authorized to request this approval.",
      success: false,
    };
  }
  const reason = input.reason.trim();
  if (!reason) {
    return { error: "A reason is required.", success: false };
  }

  const order = await getGuestOrderById(input.orderId);
  if (!order) {
    return { error: "Order not found.", success: false };
  }
  if (
    input.requestType === "preorder_lead_time_exception" &&
    input.payload.kind !== "preorder_lead_time_exception"
  ) {
    return { error: "Preorder exception payload is required.", success: false };
  }

  let rpcPayload: Record<string, unknown>;
  if (input.payload.kind === "discount_exception") {
    rpcPayload = discountExceptionToRpcPayload(input.payload);
  } else if (input.payload.kind === "cross_month_pickup") {
    rpcPayload = crossMonthPayloadToRpc(input.payload);
  } else if (input.payload.kind === "preorder_lead_time_exception") {
    rpcPayload = preorderLeadTimeExceptionToRpc(input.payload);
  } else {
    if (
      !isWithinTwoDayChangeCutoff({ pickupDate: order.pickupDate })
    ) {
      return {
        error:
          "This order is outside the 2-day change cutoff. Save the order directly.",
        success: false,
      };
    }
    const proposedPickup = input.payload.proposed.pickupDate;
    if (
      proposedPickup &&
      requiresCrossMonthApproval({
        currentPickupDate: order.pickupDate,
        proposedPickupDate: proposedPickup,
      })
    ) {
      return {
        error: "Cross-month pickup must use the cross-month approval type.",
        success: false,
      };
    }
    rpcPayload = lateOrderEditPayloadToRpc(input.payload);
  }

  const supabase = await createClient();
  if (input.requestType === "preorder_lead_time_exception") {
    const { error } = await supabase.rpc(
      "create_preorder_lead_time_exception_request",
      {
        p_order_id: input.orderId,
        p_actor_staff_id: staff.id,
        p_reason: reason,
        p_payload: rpcPayload,
      },
    );
    if (error) {
      return { error: rpcErrorMessage(error), success: false };
    }
    scheduleStaffNotificationDispatch();
    await revalidateApprovalPaths(input.orderId);
    return { error: null, success: true };
  }

  const { error } = await supabase.rpc("create_operations_approval_request", {
    p_order_id: input.orderId,
    p_actor_staff_id: staff.id,
    p_request_type: input.requestType,
    p_reason: reason,
    p_payload: rpcPayload,
  });
  if (error) {
    return { error: rpcErrorMessage(error), success: false };
  }
  scheduleStaffNotificationDispatch();
  await revalidateApprovalPaths(input.orderId);
  return { error: null, success: true };
}

export async function cancelOperationsApprovalAction(
  requestId: string,
  orderId: string,
): Promise<OperationsApprovalActionState> {
  const staff = await requireStaff();
  const supabase = await createClient();
  const { data: row, error: loadError } = await supabase
    .from("operations_approval_requests")
    .select("id, requested_by, status, order_id")
    .eq("id", requestId)
    .maybeSingle();
  if (loadError) {
    return { error: rpcErrorMessage(loadError), success: false };
  }
  if (!row) {
    return { error: "Approval request not found.", success: false };
  }
  if (
    !canCancelOperationsApproval({
      role: staff.role.code,
      staffId: staff.id,
      requestedBy: row.requested_by as string,
      status: isOperationsApprovalStatus(String(row.status))
        ? row.status
        : "pending",
    })
  ) {
    return { error: "Not authorized to cancel this approval request.", success: false };
  }

  const { error } = await supabase.rpc("cancel_operations_approval_request", {
    p_request_id: requestId,
    p_actor_staff_id: staff.id,
  });
  if (error) {
    return { error: rpcErrorMessage(error), success: false };
  }
  await revalidateApprovalPaths(orderId);
  return { error: null, success: true };
}

export async function rejectOperationsApprovalAction(
  requestId: string,
  orderId: string,
  reviewerNote: string,
): Promise<OperationsApprovalActionState> {
  const staff = await requireStaff();
  const supabase = await createClient();
  const { data: row, error: loadError } = await supabase
    .from("operations_approval_requests")
    .select("id, requested_by, status, request_type, order_id")
    .eq("id", requestId)
    .maybeSingle();
  if (loadError) {
    return { error: rpcErrorMessage(loadError), success: false };
  }
  if (!row) {
    return { error: "Approval request not found.", success: false };
  }
  if (!isOperationsApprovalType(String(row.request_type))) {
    return { error: "Unsupported approval type.", success: false };
  }
  if (requesterCannotDecideOwnRequest({
    actorStaffId: staff.id,
    requestedBy: row.requested_by as string,
  })) {
    return {
      error: "Requester cannot approve or reject their own request.",
      success: false,
    };
  }
  if (
    !canReviewOperationsApprovalType(staff.role.code, row.request_type, {
      isBakeryPreorderApprover: await staffHasBakeryPreorderApprover(staff.id),
    })
  ) {
    return { error: "Not authorized to reject this approval request.", success: false };
  }
  const note = reviewerNote.trim();
  if (!note) {
    return { error: "A rejection note is required.", success: false };
  }

  const { error } = await supabase.rpc("reject_operations_approval_request", {
    p_request_id: requestId,
    p_actor_staff_id: staff.id,
    p_reviewer_note: note,
  });
  if (error) {
    return { error: rpcErrorMessage(error), success: false };
  }
  await revalidateApprovalPaths(orderId);
  return { error: null, success: true };
}

export async function approveOperationsApprovalAction(
  requestId: string,
  orderId: string,
  reviewerNote?: string,
): Promise<OperationsApprovalActionState> {
  const staff = await requireStaff();
  const order = await getGuestOrderById(orderId);
  if (!order) {
    return { error: "Order not found.", success: false };
  }

  const supabase = await createClient();
  const { data: row, error: loadError } = await supabase
    .from("operations_approval_requests")
    .select("id, requested_by, status, request_type, order_id")
    .eq("id", requestId)
    .maybeSingle();
  if (loadError) {
    return { error: rpcErrorMessage(loadError), success: false };
  }
  if (!row) {
    return { error: "Approval request not found.", success: false };
  }
  if (String(row.order_id) !== orderId) {
    return { error: "Approval request does not match this order.", success: false };
  }
  if (!isOperationsApprovalType(String(row.request_type))) {
    return { error: "Unsupported approval type.", success: false };
  }
  if (requesterCannotDecideOwnRequest({
    actorStaffId: staff.id,
    requestedBy: row.requested_by as string,
  })) {
    return {
      error: "Requester cannot approve or reject their own request.",
      success: false,
    };
  }
  if (
    !canReviewOperationsApprovalType(staff.role.code, row.request_type, {
      isBakeryPreorderApprover: await staffHasBakeryPreorderApprover(staff.id),
    })
  ) {
    return { error: "Not authorized to approve this approval request.", success: false };
  }

  const { error } = await supabase.rpc("approve_operations_approval_request", {
    p_request_id: requestId,
    p_actor_staff_id: staff.id,
    p_reviewer_note: reviewerNote?.trim() || null,
  });
  if (error) {
    return { error: rpcErrorMessage(error), success: false };
  }

  if (row.request_type === "discount_exception") {
    const reconcile = await reconcileAfterDiscountApproval({
      orderId,
      before: order,
      staffId: staff.id,
    });
    if (reconcile.error) {
      return { error: reconcile.error, success: false };
    }
  } else if (row.request_type === "late_order_edit") {
    // Same Paid ↔ Awaiting Payment path as discount approve / direct save.
    // Confirmation outdate already runs inside the approve RPC.
    const reconcile = await reconcilePaymentLifecycleAfterApproval({
      orderId,
      before: order,
      staffId: staff.id,
    });
    if (reconcile.error) {
      return { error: reconcile.error, success: false };
    }
  }

  await revalidateApprovalPaths(orderId);
  return { error: null, success: true };
}

/**
 * After a financial approval mutation: Paid ↔ Awaiting Payment from settlement.
 * Does not touch payment rows. Same rules as direct workspace save.
 */
async function reconcilePaymentLifecycleAfterApproval(input: {
  orderId: string;
  before: StorefrontOrder;
  staffId: string;
}): Promise<{ error: string | null }> {
  const after = await getGuestOrderById(input.orderId);
  if (!after) {
    return { error: "Order not found after update." };
  }

  const reconciled = reconcilePaymentLifecycleStatus({
    previousStatus: input.before.status,
    previousNetReceived: input.before.settlement.netReceived,
    settlement: after.settlement,
  });

  if (reconciled.statusChanged) {
    const supabase = await createClient();
    const { error } = await supabase
      .from("orders")
      .update({
        status: reconciled.newStatus,
        payment_status: reconciled.newStatus === "paid" ? "paid" : "unpaid",
        updated_by: input.staffId,
      })
      .eq("id", input.orderId)
      .is("customer_id", null);
    if (error) {
      return { error: error.message };
    }
  }

  return { error: null };
}

async function reconcileAfterDiscountApproval(input: {
  orderId: string;
  before: StorefrontOrder;
  staffId: string;
}): Promise<{ error: string | null }> {
  const payment = await reconcilePaymentLifecycleAfterApproval(input);
  if (payment.error) return payment;

  if (!orderStatusAllowsConfirmationInvalidation(input.before.status)) {
    return { error: null };
  }
  const latest = await getGuestOrderById(input.orderId);
  if (!latest) {
    return { error: "Order not found after update." };
  }
  if (
    !financialMateriallyAffectsConfirmation(
      input.before.settlement.amountDue,
      latest.settlement.amountDue,
    )
  ) {
    return { error: null };
  }

  const supabase = await createClient();
  const { data: latestSent } = await supabase
    .from("order_confirmation_snapshots")
    .select("id")
    .eq("order_id", input.orderId)
    .eq("lifecycle_status", "sent")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestSent?.id) {
    await supabase
      .from("order_confirmation_snapshots")
      .update({
        lifecycle_status: "outdated",
        outdated_at: new Date().toISOString(),
      })
      .eq("id", latestSent.id)
      .eq("lifecycle_status", "sent");
  }

  return { error: null };
}

export async function markPreorderExceptionCustomerInformedAction(
  requestId: string,
  orderId: string,
): Promise<OperationsApprovalActionState> {
  const staff = await requireStaff();
  if (
    staff.role.code !== "customer_operations" &&
    staff.role.code !== "manager" &&
    staff.role.code !== "owner"
  ) {
    return { error: "Not authorized to mark customer informed.", success: false };
  }

  const supabase = await createClient();
  const { data: row, error: loadError } = await supabase
    .from("operations_approval_requests")
    .select("id, order_id, request_type, status")
    .eq("id", requestId)
    .maybeSingle();
  if (loadError) {
    return { error: rpcErrorMessage(loadError), success: false };
  }
  if (!row) {
    return { error: "Approval request not found.", success: false };
  }
  if (String(row.order_id) !== orderId) {
    return { error: "Approval request does not match this order.", success: false };
  }
  if (String(row.request_type) !== "preorder_lead_time_exception") {
    return {
      error: "Only preorder exceptions support customer informed.",
      success: false,
    };
  }

  const { error } = await supabase.rpc(
    "mark_preorder_exception_customer_informed",
    {
      p_request_id: requestId,
      p_actor_staff_id: staff.id,
    },
  );
  if (error) {
    return { error: rpcErrorMessage(error), success: false };
  }
  await revalidateApprovalPaths(orderId);
  return { error: null, success: true };
}

export async function withdrawPreorderLeadTimeExceptionAction(
  requestId: string,
  orderId: string,
  note?: string,
): Promise<OperationsApprovalActionState> {
  const staff = await requireStaff();
  const isBakeryPreorderApprover =
    staff.role.code === "bakery"
      ? await staffHasBakeryPreorderApprover(staff.id)
      : false;
  if (
    staff.role.code !== "owner" &&
    staff.role.code !== "manager" &&
    staff.role.code !== "customer_operations" &&
    !(staff.role.code === "bakery" && isBakeryPreorderApprover)
  ) {
    return { error: "Not authorized to withdraw this approval.", success: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("withdraw_preorder_lead_time_exception", {
    p_request_id: requestId,
    p_actor_staff_id: staff.id,
    p_note: note?.trim() || null,
  });
  if (error) {
    return { error: rpcErrorMessage(error), success: false };
  }
  await revalidateApprovalPaths(orderId);
  return { error: null, success: true };
}

export async function correctPreorderExceptionCustomerInformedAction(
  requestId: string,
  orderId: string,
  note: string,
): Promise<OperationsApprovalActionState> {
  const staff = await requireStaff();
  if (staff.role.code !== "owner" && staff.role.code !== "manager") {
    return {
      error: "Only Manager or Owner can correct Customer Informed.",
      success: false,
    };
  }
  const correctionNote = note.trim();
  if (!correctionNote) {
    return { error: "A correction note is required.", success: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "correct_preorder_exception_customer_informed",
    {
      p_request_id: requestId,
      p_actor_staff_id: staff.id,
      p_note: correctionNote,
    },
  );
  if (error) {
    return { error: rpcErrorMessage(error), success: false };
  }
  await revalidateApprovalPaths(orderId);
  return { error: null, success: true };
}
