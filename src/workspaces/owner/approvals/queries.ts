import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  isOperationsApprovalStatus,
  isOperationsApprovalType,
  parseOperationsApprovalFingerprint,
  parseOperationsApprovalPayload,
  type OperationsApprovalRecord,
  type OperationsApprovalStatus,
} from "@/engines/operations/approvals";

type ApprovalRow = {
  id: string;
  order_id: string;
  request_type: string;
  status: string;
  reason: string;
  payload: unknown;
  order_fingerprint: unknown;
  requested_by: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reviewer_note: string | null;
  created_at: string;
  updated_at: string;
};

type StaffAttribution = {
  displayName: string;
  roleName: string | null;
};

function isMissingRelation(message: string): boolean {
  return /does not exist|schema cache|could not find/i.test(message);
}

function unwrapRoleName(
  roles:
    | { name: string }
    | { name: string }[]
    | null
    | undefined,
): string | null {
  if (!roles) return null;
  const row = Array.isArray(roles) ? roles[0] : roles;
  const name = row?.name?.trim();
  return name || null;
}

export async function listPendingOperationsApprovals(): Promise<
  OperationsApprovalRecord[]
> {
  return listOperationsApprovals({ status: "pending" });
}

export async function listOperationsApprovals(input?: {
  status?: OperationsApprovalStatus;
  orderId?: string;
}): Promise<OperationsApprovalRecord[]> {
  const supabase = await createClient();
  let query = supabase
    .from("operations_approval_requests")
    .select(
      "id, order_id, request_type, status, reason, payload, order_fingerprint, requested_by, reviewed_by, reviewed_at, reviewer_note, created_at, updated_at",
    )
    .order("created_at", { ascending: false });
  if (input?.status) {
    query = query.eq("status", input.status);
  }
  if (input?.orderId) {
    query = query.eq("order_id", input.orderId);
  }
  const { data, error } = await query;
  if (error) {
    if (isMissingRelation(error.message)) return [];
    throw new Error(error.message);
  }
  return hydrateApprovalRows((data ?? []) as ApprovalRow[]);
}

export async function listApprovalsForOrder(
  orderId: string,
): Promise<OperationsApprovalRecord[]> {
  return listOperationsApprovals({ orderId });
}

export async function getOperationsApprovalById(
  id: string,
): Promise<OperationsApprovalRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("operations_approval_requests")
    .select(
      "id, order_id, request_type, status, reason, payload, order_fingerprint, requested_by, reviewed_by, reviewed_at, reviewer_note, created_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (isMissingRelation(error.message)) return null;
    throw new Error(error.message);
  }
  if (!data) return null;
  const mapped = await hydrateApprovalRows([data as ApprovalRow]);
  return mapped[0] ?? null;
}

async function hydrateApprovalRows(
  rows: ApprovalRow[],
): Promise<OperationsApprovalRecord[]> {
  if (rows.length === 0) return [];
  const supabase = await createClient();
  const orderIds = [...new Set(rows.map((row) => row.order_id))];
  const staffIds = [
    ...new Set(
      rows.flatMap((row) =>
        [row.requested_by, row.reviewed_by].filter(
          (id): id is string => Boolean(id),
        ),
      ),
    ),
  ];

  const [{ data: orders }, staffMap] = await Promise.all([
    supabase
      .from("orders")
      .select("id, order_number, guest_name, pickup_date, pickup_time")
      .in("id", orderIds)
      .is("customer_id", null),
    loadStaffAttribution(staffIds),
  ]);

  const orderMap = new Map(
    (orders ?? []).map((order) => [
      order.id as string,
      order as {
        id: string;
        order_number: string;
        guest_name: string | null;
        pickup_date: string;
        pickup_time: string;
      },
    ]),
  );

  const mapped: OperationsApprovalRecord[] = [];
  for (const row of rows) {
    if (!isOperationsApprovalType(row.request_type)) continue;
    if (!isOperationsApprovalStatus(row.status)) continue;
    const payload = parseOperationsApprovalPayload(row.request_type, row.payload);
    const fingerprint = parseOperationsApprovalFingerprint(row.order_fingerprint);
    if (!payload || !fingerprint) continue;
    const order = orderMap.get(row.order_id);
    const requester = staffMap.get(row.requested_by) ?? null;
    const reviewer = row.reviewed_by
      ? (staffMap.get(row.reviewed_by) ?? null)
      : null;
    mapped.push({
      id: row.id,
      orderId: row.order_id,
      orderNumber: order?.order_number ?? "",
      customerName: order?.guest_name?.trim() || "Guest",
      pickupDate: order?.pickup_date ?? fingerprint.pickupDate,
      pickupTime: order?.pickup_time ?? fingerprint.pickupTime,
      requestType: row.request_type,
      status: row.status,
      reason: row.reason,
      payload,
      orderFingerprint: fingerprint,
      requestedBy: row.requested_by,
      requestedByName: requester?.displayName ?? null,
      requestedByRoleName: requester?.roleName ?? null,
      reviewedBy: row.reviewed_by,
      reviewedByName: reviewer?.displayName ?? null,
      reviewedByRoleName: reviewer?.roleName ?? null,
      reviewedAt: row.reviewed_at,
      reviewerNote: row.reviewer_note,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
  return mapped;
}

/**
 * Attribution names must resolve for any authorized viewer. Session RLS on
 * staff_profiles is own-row-only ("Staff can read own profile"), so an Owner
 * reviewing Vivian's request would otherwise fall back to "Staff". Use service
 * role for this presentation lookup only — same pattern as fee-request attribution.
 */
async function loadStaffAttribution(
  staffIds: string[],
): Promise<Map<string, StaffAttribution>> {
  const map = new Map<string, StaffAttribution>();
  if (staffIds.length === 0) return map;
  try {
    const admin = createServiceClient();
    const { data, error } = await admin
      .from("staff_profiles")
      .select("id, display_name, roles!inner ( name )")
      .in("id", staffIds);
    if (error) return map;
    for (const row of data ?? []) {
      const displayName = String(row.display_name ?? "").trim();
      if (!displayName) continue;
      map.set(row.id as string, {
        displayName,
        roleName: unwrapRoleName(
          (row as { roles?: { name: string } | { name: string }[] | null })
            .roles,
        ),
      });
    }
  } catch {
    // Presentation-only; do not fail approval list loads.
  }
  return map;
}
