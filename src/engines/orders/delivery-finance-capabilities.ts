/**
 * M4-P3 Slice 2B-2 — Guest Order Workspace Delivery finance capability matrix.
 *
 * Shared route access must NOT imply Owner exception authority.
 * Manager has Delivery Charges exception + resolve authority (not Counter-like).
 * Manager still does NOT get unrelated Owner workspace controls.
 */

import type { RoleCode } from "@/types/staff";

export type GuestOrderWorkspaceCapabilities = {
  role: RoleCode;
  staffId: string;
  /** May open /owner/orders/[id] guest Order Workspace. */
  canAccessGuestOrderWorkspace: boolean;
  /** Full Edit Order / save workspace (Owner only). */
  canEditOrderWorkspace: boolean;
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
  /** Payment request / record payment surfaces. */
  canManagePayments: boolean;
  /** Discounts / Owner financial adjustments panels. */
  canManageDiscounts: boolean;
  /** Ready / Picked Up / Out for Delivery / Delivered controls (Owner only). */
  canOperateCollectionControls: boolean;
};

export function canAccessGuestOrderWorkspace(role: RoleCode): boolean {
  return (
    role === "owner" ||
    role === "manager" ||
    role === "customer_operations"
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

  return {
    role,
    staffId,
    canAccessGuestOrderWorkspace: canAccess,
    canEditOrderWorkspace: isOwner,
    canEnableDeliveryFinance: isOwner,
    canQuoteDeliveryFee: isOwner || isManager || isCounter,
    canDirectFeeExceptions: feeExceptionAuthority,
    canRequestFeeExceptions: isCounter,
    canResolveFeeRequests: feeExceptionAuthority,
    canCancelAnyFeeRequest: feeExceptionAuthority,
    canPrepareConfirmation: isOwner,
    canManagePayments: isOwner,
    canManageDiscounts: isOwner,
    canOperateCollectionControls: isOwner,
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
