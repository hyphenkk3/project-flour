/**
 * Guest Order Workspace capability matrix.
 *
 * Shared Operations: Owner + Customer Operations handle normal preorder
 * execution. Owner/Manager retain exception / override authority.
 * Do not treat Customer Operations as a bundled Owner role.
 */

import type { RoleCode } from "@/types/staff";

export type GuestOrderWorkspaceCapabilities = {
  role: RoleCode;
  staffId: string;
  /** May open /owner/orders/[id] guest Order Workspace. */
  canAccessGuestOrderWorkspace: boolean;
  /** May use Operations board (/owner) Today / Needs Attention. */
  canAccessOperationsBoard: boolean;
  /**
   * Owner-only Operations board tools: Calendar shortcut, Propose EXTRA,
   * + New Order. Independent of Edit Order.
   */
  canUseOwnerBoardTools: boolean;
  /** Normal Edit Order / save workspace (Owner + Customer Operations). */
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
  /** Prepare / mark-sent Payment Request (Owner + Customer Operations). */
  canPreparePaymentRequest: boolean;
  /** Record ordinary received payment (Owner + Customer Operations). */
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
   * (Owner + Customer Operations). Does not imply exceptional overrides.
   */
  canManageDiscounts: boolean;
  /**
   * RM10 / discount eligibility Owner override checkbox (Owner only).
   * Separated from routine canManageDiscounts.
   */
  canOverrideDiscountEligibility: boolean;
  /** Crew / Ready / Thank You message tools (Owner only). */
  canManageOrderMessages: boolean;
  /** Ready / Picked Up / Out for Delivery / Delivered controls (Owner only). */
  canOperateCollectionControls: boolean;
  /** Whole Cake Calendar read access (Owner + Customer Operations). */
  canViewWholeCakeCalendar: boolean;
  /** Create a typed Operations approval request (Customer Operations). */
  canRequestOperationsApproval: boolean;
  /**
   * Approve/reject Operations approval requests of the three supported types
   * (Owner and Manager). Does not grant the Operations board.
   */
  canReviewOperationsApprovals: boolean;
};

/** Roles that operate the shared Operations board + normal preorder follow-up. */
export function canAccessOperationsBoard(role: RoleCode): boolean {
  return role === "owner" || role === "customer_operations";
}

export function canAccessGuestOrderWorkspace(role: RoleCode): boolean {
  return (
    role === "owner" ||
    role === "manager" ||
    role === "customer_operations"
  );
}

/** Whole Cake Calendar page + read actions (view only for Customer Operations). */
export function canViewWholeCakeCalendar(role: RoleCode): boolean {
  return role === "owner" || role === "customer_operations";
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
  const isPreorderOperator = isOwner || isCounter;
  const canPreparePaymentRequest = isPreorderOperator;
  const canRecordPayment = isPreorderOperator;

  return {
    role,
    staffId,
    canAccessGuestOrderWorkspace: canAccess,
    canAccessOperationsBoard: canAccessOperationsBoard(role),
    canUseOwnerBoardTools: isOwner,
    canEditOrderWorkspace: isPreorderOperator,
    canOverridePickupMonth: isOwner,
    canEnableDeliveryFinance: isOwner,
    canQuoteDeliveryFee: isOwner || isManager || isCounter,
    canDirectFeeExceptions: feeExceptionAuthority,
    canRequestFeeExceptions: isCounter,
    canResolveFeeRequests: feeExceptionAuthority,
    canCancelAnyFeeRequest: feeExceptionAuthority,
    canPrepareConfirmation: isPreorderOperator,
    canPreparePaymentRequest,
    canRecordPayment,
    canManagePayments: canPreparePaymentRequest || canRecordPayment,
    canExtendPaymentDeadline: isOwner,
    canManageDiscounts: isPreorderOperator,
    canOverrideDiscountEligibility: isOwner,
    canManageOrderMessages: isOwner,
    canOperateCollectionControls: isOwner,
    canViewWholeCakeCalendar: canViewWholeCakeCalendar(role),
    canRequestOperationsApproval: isCounter,
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
