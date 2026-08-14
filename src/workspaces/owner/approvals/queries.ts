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

function isMissingRelation(message: string): boolean {
  return /does not exist|schema cache|could not find/i.test(message);
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

  const [{ data: orders }, { data: staff }] = await Promise.all([
    supabase
      .from("orders")
      .select("id, order_number, guest_name, pickup_date, pickup_time")
      .in("id", orderIds)
      .is("customer_id", null),
    staffIds.length > 0
      ? supabase
          .from("staff_profiles")
          .select("id, display_name")
          .in("id", staffIds)
      : Promise.resolve({ data: [] as Array<{ id: string; display_name: string }> }),
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
  const staffMap = new Map(
    (staff ?? []).map((row) => [row.id as string, row.display_name as string]),
  );

  const mapped: OperationsApprovalRecord[] = [];
  for (const row of rows) {
    if (!isOperationsApprovalType(row.request_type)) continue;
    if (!isOperationsApprovalStatus(row.status)) continue;
    const payload = parseOperationsApprovalPayload(row.request_type, row.payload);
    const fingerprint = parseOperationsApprovalFingerprint(row.order_fingerprint);
    if (!payload || !fingerprint) continue;
    const order = orderMap.get(row.order_id);
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
      requestedByName: staffMap.get(row.requested_by) ?? null,
      reviewedBy: row.reviewed_by,
      reviewedByName: row.reviewed_by
        ? (staffMap.get(row.reviewed_by) ?? null)
        : null,
      reviewedAt: row.reviewed_at,
      reviewerNote: row.reviewer_note,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
  return mapped;
}
