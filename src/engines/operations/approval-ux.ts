/**
 * Operations approval discoverability, history filters, and pending-block copy.
 * Read-model / presentation only. Does not change approval authority, execution,
 * stale detection, or pending uniqueness.
 */

import { buildApprovalChangeSummary } from "@/engines/operations/approval-change-summary";
import {
  OPERATIONS_APPROVAL_STATUSES,
  OPERATIONS_APPROVAL_TYPES,
  approvalTypeLabel,
  canAccessOperationsApprovalsInbox,
  type OperationsApprovalRecord,
  type OperationsApprovalStatus,
  type OperationsApprovalType,
} from "@/engines/operations/approvals";
import type { RoleCode } from "@/types/staff";

export const OPERATIONS_APPROVALS_SECTION_ID = "operations-approvals";

export const OPERATIONS_APPROVAL_HISTORY_PATH = "/owner/approvals/history";

export const OPERATIONS_APPROVAL_STATUS_LABELS: Record<
  OperationsApprovalStatus,
  string
> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export const PENDING_LATE_EDIT_ALREADY_TITLE = "Approval already pending";

export const PENDING_LATE_EDIT_ALREADY_BODY =
  "This order already has a pending late-change approval. Review or cancel the existing approval before submitting another late change.";

export const VIEW_PENDING_APPROVAL_LABEL = "View pending approval";

export const CANCEL_PENDING_APPROVAL_LABEL = "Cancel pending approval";

/** Shown next to late-edit Request Approval (CO within 2-day cutoff). */
export const LATE_ORDER_EDIT_APPROVAL_SCOPE_SUMMARY =
  "Request Approval covers cake items, paid add-ons, and same-month pickup date/time only.";

export const LATE_ORDER_EDIT_APPROVAL_SCOPE_EXCLUSIONS =
  "Customer details, notes, complimentary items, and fulfilment method are not included — ask Owner if those need updating.";

/** Short inline cues for Edit Order sections when `blockDirectSave` (CO cutoff). */
export const LATE_ORDER_EDIT_SECTION_INCLUDED =
  "Changes here can be requested for approval.";

export const LATE_ORDER_EDIT_SECTION_PICKUP_INCLUDED =
  "Same-month pickup date/time changes can be requested for approval.";

export const LATE_ORDER_EDIT_SECTION_EXCLUDED =
  "Not included in late-change approval — ask Owner if this needs updating.";

export function canAccessOperationsApprovalHistory(role: RoleCode): boolean {
  return (
    role === "owner" || role === "manager" || role === "customer_operations"
  );
}

export function pendingOperationsApprovalCount(
  rows: Array<{ status: string }>,
): number {
  return rows.filter((row) => row.status === "pending").length;
}

export function pendingApprovalsLabel(count: number): string {
  return count === 1 ? "Approval Pending" : "Approvals Pending";
}

export function operationsApprovalsSectionHref(): string {
  return `#${OPERATIONS_APPROVALS_SECTION_ID}`;
}

const OPERATIONS_TODAY_PENDING_APPROVALS_HREF = `/owner?pickup=today#${OPERATIONS_APPROVALS_SECTION_ID}`;

/**
 * Home "Pending approvals" destination.
 * Owner + Manager: dedicated inbox. Customer Operations: Operations section
 * (they cannot open `/owner/approvals`).
 */
export function homePendingApprovalsHref(role: RoleCode): string {
  if (canAccessOperationsApprovalsInbox(role)) {
    return "/owner/approvals";
  }
  return OPERATIONS_TODAY_PENDING_APPROVALS_HREF;
}

export function pendingLateOrderEdit(
  rows: OperationsApprovalRecord[],
): OperationsApprovalRecord | null {
  return (
    rows.find(
      (row) =>
        row.status === "pending" && row.requestType === "late_order_edit",
    ) ?? null
  );
}

export function viewPendingApprovalHref(
  orderId: string,
  requestId: string,
): string {
  return `/owner/orders/${orderId}?approval=${requestId}`;
}

export function approvalPanelDomId(requestId: string): string {
  return `approval-${requestId}`;
}

export type ApprovalHistoryStatusFilter = OperationsApprovalStatus | "all";
export type ApprovalHistoryTypeFilter = OperationsApprovalType | "all";

export type ApprovalHistoryFilters = {
  status: ApprovalHistoryStatusFilter;
  requestType: ApprovalHistoryTypeFilter;
  search: string;
};

export const DEFAULT_APPROVAL_HISTORY_FILTERS: ApprovalHistoryFilters = {
  status: "all",
  requestType: "all",
  search: "",
};

export function isApprovalHistoryStatusFilter(
  value: string,
): value is ApprovalHistoryStatusFilter {
  return value === "all" || OPERATIONS_APPROVAL_STATUSES.includes(value as OperationsApprovalStatus);
}

export function isApprovalHistoryTypeFilter(
  value: string,
): value is ApprovalHistoryTypeFilter {
  return value === "all" || OPERATIONS_APPROVAL_TYPES.includes(value as OperationsApprovalType);
}

export type ApprovalHistoryRow = {
  id: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  requestType: OperationsApprovalType;
  typeLabel: string;
  status: OperationsApprovalStatus;
  statusLabel: string;
  requestedByLabel: string;
  requestedByName: string;
  requestedAt: string;
  reason: string;
  changeSummaryLines: string[];
  changeLines: ReturnType<typeof buildApprovalChangeSummary>["changeLines"];
  reviewedByLabel: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  href: string;
};

/** Display label for requester / reviewer attribution. */
export function formatApprovalActorLabel(input: {
  name: string | null | undefined;
  roleName?: string | null | undefined;
  includeRole?: boolean;
}): string {
  const name = input.name?.trim() || "Staff";
  if (input.includeRole === false) return name;
  const role = input.roleName?.trim();
  return role ? `${name} · ${role}` : name;
}

export function approvalHistoryRowFromRecord(
  row: OperationsApprovalRecord,
  returnTo?: string | null,
): ApprovalHistoryRow {
  const summary = buildApprovalChangeSummary(row.payload);
  const path = viewPendingApprovalHref(row.orderId, row.id);
  const href = returnTo
    ? `${path}${path.includes("?") ? "&" : "?"}returnTo=${encodeURIComponent(returnTo)}`
    : path;
  const requestedByLabel = formatApprovalActorLabel({
    name: row.requestedByName,
    roleName: row.requestedByRoleName,
  });
  const reviewedByLabel = row.reviewedAt
    ? formatApprovalActorLabel({
        name: row.reviewedByName,
        roleName: row.reviewedByRoleName,
        includeRole: false,
      })
    : null;
  return {
    id: row.id,
    orderId: row.orderId,
    orderNumber: row.orderNumber,
    customerName: row.customerName,
    requestType: row.requestType,
    typeLabel: approvalTypeLabel(row.requestType),
    status: row.status,
    statusLabel: OPERATIONS_APPROVAL_STATUS_LABELS[row.status],
    requestedByLabel,
    requestedByName: requestedByLabel,
    requestedAt: row.createdAt,
    reason: row.reason,
    changeSummaryLines: summary.lines,
    changeLines: summary.changeLines,
    reviewedByLabel,
    reviewedByName: reviewedByLabel,
    reviewedAt: row.reviewedAt,
    href,
  };
}

export function filterOperationsApprovalHistory(
  rows: OperationsApprovalRecord[],
  filters: ApprovalHistoryFilters,
): OperationsApprovalRecord[] {
  const needle = filters.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.status !== "all" && row.status !== filters.status) return false;
    if (filters.requestType !== "all" && row.requestType !== filters.requestType) {
      return false;
    }
    if (!needle) return true;
    const haystack = [
      row.orderNumber,
      row.customerName,
      row.reason,
      approvalTypeLabel(row.requestType),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}

/**
 * Bounded decided-approval panels for Order Workspace.
 * Keeps the latest `limit` decided rows; when `highlightApprovalId` targets an
 * older decided record (History deep-link), includes that row once as well.
 * Caller passes decided rows only (newest-first). Pending rows are unchanged.
 */
export function visibleDecidedApprovalsForOrder(
  decided: OperationsApprovalRecord[],
  highlightApprovalId?: string | null,
  limit = 5,
): OperationsApprovalRecord[] {
  const latest = decided.slice(0, limit);
  if (!highlightApprovalId) return latest;
  if (latest.some((row) => row.id === highlightApprovalId)) return latest;
  const requested = decided.find((row) => row.id === highlightApprovalId);
  if (!requested) return latest;
  return [...latest, requested];
}
