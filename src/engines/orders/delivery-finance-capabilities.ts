/**
 * Guest Order Workspace capability matrix.
 *
 * Routine customer/order servicing: Owner + Manager + Customer Operations.
 * Operations board + Whole Cake Calendar VIEW: Owner + Manager + Customer Operations.
 * Owner-only mutations/overrides stay Owner-gated (board tools, calendar Propose EXTRA, etc.).
 * Do not treat Customer Operations or Manager as a bundled Owner role.
 */

import type { RoleCode } from "@/types/staff";

export type GuestOrderWorkspaceCapabilities = {
  role: RoleCode;
  staffId: string;
  /** May open /owner/orders/[id] guest Order Workspace. */
  canAccessGuestOrderWorkspace: boolean;
  /** May open / view Operations board (/owner) Today / Needs Attention. */
  canAccessOperationsBoard: boolean;
  /**
   * Owner-only Operations board mutations: Propose EXTRA shortcut,
   * + New Order. Independent of Edit Order and board VIEW access.
   */
  canUseOwnerBoardTools: boolean;
  /**
   * Normal Edit Order / save workspace
   * (Owner + Manager + Customer Operations).
   * Manager direct-saves inside D−1/D−0; CO uses late_order_edit approval.
   */
  canEditOrderWorkspace: boolean;
  /**
   * Cross-month pickup / delivery month change (Owner override only).
   * Not granted with normal Edit Order.
   */
  canOverridePickupMonth: boolean;
  /** Enable Delivery Charges on historical finance-disabled Delivery. */
  canEnableDeliveryFinance: boolean;
  /** Quote / re-quote normal Delivery Fee (> RM0). */
  canQuoteDeliveryFee: boolean;
  /** Direct waive / restore / processing override (Owner or Manager). */
  canDirectFeeExceptions: boolean;
  /** Submit Delivery waiver / Processing change requests (Counter only). */
  canRequestFeeExceptions: boolean;
  /** Approve / reject pending Counter fee requests (Owner or Manager). */
  canResolveFeeRequests: boolean;
  /** Cancel any pending fee request (Owner or Manager dismiss). */
  canCancelAnyFeeRequest: boolean;
  /** Prepare Confirmation / Updated Confirmation / Customer confirmed. */
  canPrepareConfirmation: boolean;
  /** Prepare / mark-sent Payment Request (Owner + Manager + Customer Operations). */
  canPreparePaymentRequest: boolean;
  /** Record ordinary received payment (Owner + Manager + Customer Operations). */
  canRecordPayment: boolean;
  /**
   * @deprecated Prefer canPreparePaymentRequest / canRecordPayment.
   * True when either payment communication or record authority is granted.
   */
  canManagePayments: boolean;
  /** Extend payment follow-up deadline (Owner only). */
  canExtendPaymentDeadline: boolean;
  /**
   * Routine discount / promo / voucher mechanisms for normal preorder prep
   * (Owner + Manager + Customer Operations). Does not imply exceptional overrides.
   */
  canManageDiscounts: boolean;
  /**
   * RM10 / discount eligibility Owner override checkbox (Owner only).
   * Separated from routine canManageDiscounts.
   */
  canOverrideDiscountEligibility: boolean;
  /**
   * Crew / Thank You / Delivery customer messages
   * (Owner + Manager + Customer Operations).
   */
  canManageOrderMessages: boolean;
  /**
   * Picked Up / Out for Delivery / Delivered controls
   * (Owner + Manager + Customer Operations).
   * Mark/Undo Ready stays Owner-only on this surface.
   */
  canOperateCollectionControls: boolean;
  /** Whole Cake Calendar read / navigate access (Owner + Manager + Customer Operations). */
  canViewWholeCakeCalendar: boolean;
  /** Create late-edit / discount approval requests (Customer Operations). */
  canRequestOperationsApproval: boolean;
  /**
   * Create a cross_month_pickup approval request
   * (Customer Operations + Manager). Independent of Owner month override.
   */
  canRequestCrossMonthPickupApproval: boolean;
  /**
   * Approve/reject Operations approval requests of the three supported types
   * (Owner and Manager). Independent of Operations board VIEW access.
   */
  canReviewOperationsApprovals: boolean;
};

/** Roles that may open/view the shared Operations board. */
export function canAccessOperationsBoard(role: RoleCode): boolean {
  return (
    role === "owner" ||
    role === "manager" ||
    role === "customer_operations"
  );
}

export function canAccessGuestOrderWorkspace(role: RoleCode): boolean {
  return (
    role === "owner" ||
    role === "manager" ||
    role === "customer_operations" ||
    role === "bakery"
  );
}

/** Whole Cake Calendar page + read / navigate actions. */
export function canViewWholeCakeCalendar(role: RoleCode): boolean {
  return (
    role === "owner" ||
    role === "manager" ||
    role === "customer_operations" ||
    role === "bakery"
  );
}

export function buildGuestOrderWorkspaceCapabilities(input: {
  role: RoleCode;
  staffId: string;
}): GuestOrderWorkspaceCapabilities {
  const { role, staffId } = input;
  const isOwner = role === "owner";
  const isManager = role === "manager";
  const isCounter = role === "customer_operations";
  const canAccess = canAccessGuestOrderWorkspace(role);
  const feeExceptionAuthority = isOwner || isManager;
  /**
   * Routine customer/order servicing operators.
   * Includes Manager for parity with Customer Operations on messages,
   * fulfilment, payments, confirmation prep, and Edit Order.
   */
  const isRoutineOrderOperator = isOwner || isManager || isCounter;
  const canPreparePaymentRequest = isRoutineOrderOperator;
  const canRecordPayment = isRoutineOrderOperator;

  return {
    role,
    staffId,
    canAccessGuestOrderWorkspace: canAccess,
    canAccessOperationsBoard: canAccessOperationsBoard(role),
    canUseOwnerBoardTools: isOwner,
    canEditOrderWorkspace: isRoutineOrderOperator,
    canOverridePickupMonth: isOwner,
    canEnableDeliveryFinance: isOwner,
    canQuoteDeliveryFee: isOwner || isManager || isCounter,
    canDirectFeeExceptions: feeExceptionAuthority,
    canRequestFeeExceptions: isCounter,
    canResolveFeeRequests: feeExceptionAuthority,
    canCancelAnyFeeRequest: feeExceptionAuthority,
    canPrepareConfirmation: isRoutineOrderOperator,
    canPreparePaymentRequest,
    canRecordPayment,
    canManagePayments: canPreparePaymentRequest || canRecordPayment,
    canExtendPaymentDeadline: isOwner,
    canManageDiscounts: isRoutineOrderOperator,
    canOverrideDiscountEligibility: isOwner,
    canManageOrderMessages: isRoutineOrderOperator,
    canOperateCollectionControls: isRoutineOrderOperator,
    canViewWholeCakeCalendar: canViewWholeCakeCalendar(role),
    canRequestOperationsApproval: isCounter,
    canRequestCrossMonthPickupApproval: isManager || isCounter,
    canReviewOperationsApprovals: isOwner || isManager,
  };
}

/** Requester-own cancel, or Owner/Manager cancel-any. */
export function canCancelPendingFeeRequest(input: {
  capabilities: GuestOrderWorkspaceCapabilities;
  requestedBy: string | null | undefined;
}): boolean {
  const { capabilities, requestedBy } = input;
  if (capabilities.canCancelAnyFeeRequest) return true;
  if (!requestedBy) return false;
  return requestedBy === capabilities.staffId;
}
