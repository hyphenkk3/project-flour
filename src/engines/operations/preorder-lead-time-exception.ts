/**
 * Date-specific preorder lead-time exception helpers.
 * Authority still lives in operations/approvals + SQL RPCs.
 * An approved exception permits the exact order + exact pickup date only.
 */

import type { RoleCode } from "@/types/staff";
import {
  preorderCartLineId,
  readPreorderDays,
} from "@/engines/preorder/lead";
import type { PreorderCartLine } from "@/engines/preorder/types";
import type {
  OperationsApprovalRecord,
  OperationsApprovalStatus,
  PreorderLeadTimeExceptionPayload,
} from "@/engines/operations/approvals";

export const PREORDER_LEAD_TIME_EXCEPTION_TYPE =
  "preorder_lead_time_exception" as const;

export const PREORDER_EXCEPTION_REQUIRED_TITLE = "Preorder exception required";

export const PENDING_PREORDER_EXCEPTION_BLOCKS_DATE_MESSAGE =
  "A preorder exception for this pickup date is pending approval. The date cannot be saved until it is approved.";

export const PREORDER_EXCEPTION_DATE_MISMATCH_MESSAGE =
  "An approved preorder exception applies only to its requested pickup date.";

export type PreorderExceptionAuthorityContext = {
  isBakeryPreorderApprover?: boolean;
};

export function isPreorderLeadTimeExceptionPayload(
  payload: { kind?: string } | null | undefined,
): payload is PreorderLeadTimeExceptionPayload {
  return payload?.kind === PREORDER_LEAD_TIME_EXCEPTION_TYPE;
}

export function requestedPickupDateFromException(
  row: Pick<OperationsApprovalRecord, "payload">,
): string | null {
  if (!isPreorderLeadTimeExceptionPayload(row.payload)) return null;
  return row.payload.requestedPickupDate;
}

export function requiredPreorderDaysFromLines(
  lines: readonly Pick<PreorderCartLine, "preorderDays">[],
): number {
  let max = 0;
  for (const line of lines) {
    const days = readPreorderDays(line.preorderDays);
    if (days > max) max = days;
  }
  return max;
}

export function preorderLinesFromWorkspaceItems(input: {
  items: Array<{
    cakeId: string;
    cakeSizeId: string;
    quantity: number;
    cakeName?: string;
    sizeLabel?: string;
  }>;
  cakes: Array<{
    id: string;
    name: string;
    sizes: Array<{
      id: string;
      size: string;
      preorderDays: number;
    }>;
  }>;
}): PreorderCartLine[] {
  const lines: PreorderCartLine[] = [];
  for (const item of input.items) {
    const cake = input.cakes.find((entry) => entry.id === item.cakeId);
    const size = cake?.sizes.find((entry) => entry.id === item.cakeSizeId);
    lines.push({
      lineId: preorderCartLineId(item.cakeId, item.cakeSizeId),
      cakeId: item.cakeId,
      cakeSizeId: item.cakeSizeId,
      cakeName: item.cakeName ?? cake?.name ?? "Cake",
      sizeLabel: item.sizeLabel ?? size?.size ?? "Size",
      quantity: item.quantity,
      preorderDays: readPreorderDays(size?.preorderDays),
    });
  }
  return lines;
}

export function exceptionsForPickupDate(
  rows: readonly OperationsApprovalRecord[],
  pickupDate: string,
): OperationsApprovalRecord[] {
  return rows.filter((row) => {
    if (row.requestType !== PREORDER_LEAD_TIME_EXCEPTION_TYPE) return false;
    return requestedPickupDateFromException(row) === pickupDate;
  });
}

/**
 * Active exception for this exact pickup date.
 * Approved beats pending. Withdrawn/rejected are only returned when no active row exists.
 */
export function preorderExceptionForPickupDate(
  rows: readonly OperationsApprovalRecord[],
  pickupDate: string,
): OperationsApprovalRecord | null {
  const matches = exceptionsForPickupDate(rows, pickupDate);
  return (
    matches.find((row) => row.status === "approved") ??
    matches.find((row) => row.status === "pending") ??
    matches[0] ??
    null
  );
}

export function pendingPreorderException(
  rows: readonly OperationsApprovalRecord[],
): OperationsApprovalRecord | null {
  return (
    rows.find(
      (row) =>
        row.requestType === PREORDER_LEAD_TIME_EXCEPTION_TYPE &&
        row.status === "pending",
    ) ?? null
  );
}

export function approvedPreorderExceptionPermitsDate(input: {
  status: OperationsApprovalStatus;
  requestedPickupDate: string | null | undefined;
  pickupDate: string;
}): boolean {
  if (input.status !== "approved") return false;
  if (!input.requestedPickupDate) return false;
  return input.requestedPickupDate === input.pickupDate;
}

export function recordPermitsStaffPickupDate(
  row: OperationsApprovalRecord | null | undefined,
  pickupDate: string,
): boolean {
  if (!row) return false;
  return approvedPreorderExceptionPermitsDate({
    status: row.status,
    requestedPickupDate: requestedPickupDateFromException(row),
    pickupDate,
  });
}

export function canMarkPreorderExceptionCustomerInformed(role: RoleCode): boolean {
  return (
    role === "customer_operations" || role === "manager" || role === "owner"
  );
}

export function canCorrectPreorderExceptionCustomerInformed(
  role: RoleCode,
): boolean {
  return role === "owner" || role === "manager";
}

export function canWithdrawPreorderLeadTimeException(input: {
  role: RoleCode;
  status: OperationsApprovalStatus;
  customerInformedAt: string | null | undefined;
  isBakeryPreorderApprover?: boolean;
}): boolean {
  if (input.status !== "approved") return false;
  if (input.customerInformedAt) return false;
  if (input.role === "owner" || input.role === "manager") return true;
  if (input.role === "customer_operations") return true;
  return (
    input.role === "bakery" && Boolean(input.isBakeryPreorderApprover)
  );
}

export function preorderExceptionLifecycleLabel(
  row: OperationsApprovalRecord,
): string {
  if (row.status === "pending") return "Pending Approval";
  if (row.status === "withdrawn") return "Withdrawn";
  if (row.status === "rejected") return "Rejected";
  if (row.status === "cancelled") return "Cancelled";
  if (row.status === "approved" && row.customerInformedAt) {
    return "Approved — Customer Informed";
  }
  if (row.status === "approved") {
    return "Approved — Customer Not Informed";
  }
  return row.status;
}
