import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/admin";

/**
 * Failure behavior: the credential mutation is committed first. The audit
 * insert then retries once. If the insert still fails, the caller keeps the
 * successful change and surfaces STAFF_CREDENTIAL_AUDIT_COPY.recordFailedAfterChange.
 * The change is not rolled back — Auth/profile cannot share a transaction with
 * this table — but a successful security change is never treated as a silent
 * unaudited success.
 */

export const STAFF_CREDENTIAL_EVENT_TYPES = [
  "username_changed",
  "email_changed",
  "password_changed",
  "admin_password_reset",
  "passkey_added",
  "passkey_removed",
] as const;

export type StaffCredentialEventType =
  (typeof STAFF_CREDENTIAL_EVENT_TYPES)[number];

export const STAFF_CREDENTIAL_AUDIT_COPY = {
  recordFailedAfterChange:
    "The credential change succeeded, but the security record could not be saved. Contact an Owner.",
} as const;

const FORBIDDEN_METADATA_KEY =
  /password|hash|token|secret|private|credential|raw_id|passkey_id/i;

export type StaffCredentialEventInput = {
  eventType: StaffCredentialEventType;
  actorStaffId: string;
  subjectStaffId: string;
  metadata?: Record<string, unknown>;
};

export function isStaffCredentialEventType(
  value: string,
): value is StaffCredentialEventType {
  return (STAFF_CREDENTIAL_EVENT_TYPES as readonly string[]).includes(value);
}

export function sanitizeStaffCredentialMetadata(
  input: Record<string, unknown> | null | undefined,
): Record<string, string | number | boolean> {
  const output: Record<string, string | number | boolean> = {};
  if (!input) return output;

  for (const [key, value] of Object.entries(input)) {
    if (FORBIDDEN_METADATA_KEY.test(key)) continue;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) output[key] = trimmed.slice(0, 200);
      continue;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      output[key] = value;
      continue;
    }
    if (typeof value === "boolean") {
      output[key] = value;
    }
  }

  return output;
}

export function buildStaffCredentialEventRow(input: StaffCredentialEventInput): {
  event_type: StaffCredentialEventType;
  actor_staff_id: string;
  subject_staff_id: string;
  metadata: Record<string, string | number | boolean>;
} {
  return {
    event_type: input.eventType,
    actor_staff_id: input.actorStaffId,
    subject_staff_id: input.subjectStaffId,
    metadata: sanitizeStaffCredentialMetadata(input.metadata),
  };
}

export async function recordStaffCredentialEvent(
  input: StaffCredentialEventInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = buildStaffCredentialEventRow(input);
  const admin = createServiceClient();

  const first = await admin.from("staff_credential_events").insert(row);
  if (!first.error) {
    revalidatePath("/settings/staff");
    return { ok: true };
  }

  const retry = await admin.from("staff_credential_events").insert(row);
  if (!retry.error) {
    revalidatePath("/settings/staff");
    return { ok: true };
  }

  return {
    ok: false,
    error: retry.error.message || first.error.message,
  };
}

export function staffCredentialAuditWarning(
  recorded: { ok: true } | { ok: false; error: string },
): string | null {
  return recorded.ok ? null : STAFF_CREDENTIAL_AUDIT_COPY.recordFailedAfterChange;
}

export const STAFF_CREDENTIAL_EVENT_LABELS: Record<
  StaffCredentialEventType,
  string
> = {
  username_changed: "Username changed",
  email_changed: "Email changed",
  password_changed: "Password changed",
  admin_password_reset: "Password reset",
  passkey_added: "Passkey added",
  passkey_removed: "Passkey removed",
};

export type StaffCredentialActivityItem = {
  id: string;
  eventType: StaffCredentialEventType;
  label: string;
  createdAt: string;
  actorName: string;
  subjectName: string;
  detail: string | null;
};

export function formatStaffCredentialActivityDetail(
  eventType: StaffCredentialEventType,
  metadata: Record<string, unknown>,
): string | null {
  const safe = sanitizeStaffCredentialMetadata(metadata);
  if (eventType === "username_changed") {
    const from = typeof safe.old_username === "string" ? safe.old_username : "";
    const to = typeof safe.new_username === "string" ? safe.new_username : "";
    if (from && to) return `${from} → ${to}`;
  }
  if (eventType === "email_changed") {
    const from = typeof safe.old_email === "string" ? safe.old_email : "";
    const to = typeof safe.new_email === "string" ? safe.new_email : "";
    if (from && to) return `${from} → ${to}`;
  }
  if (eventType === "passkey_added" || eventType === "passkey_removed") {
    return typeof safe.label === "string" ? safe.label : null;
  }
  return null;
}

function staffDisplayName(row: {
  display_name?: string | null;
  username?: string | null;
} | null): string {
  const display = row?.display_name?.trim();
  if (display) return display;
  const username = row?.username?.trim();
  if (username) return username;
  return "Unknown staff";
}

export async function listStaffCredentialEventsForAdmin(
  limit = 40,
): Promise<StaffCredentialActivityItem[]> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("staff_credential_events")
    .select("id, event_type, metadata, created_at, actor_staff_id, subject_staff_id")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  const rows = data ?? [];
  const staffIds = Array.from(
    new Set(
      rows.flatMap((row) =>
        [row.actor_staff_id, row.subject_staff_id].filter(
          (id): id is string => typeof id === "string" && id.length > 0,
        ),
      ),
    ),
  );

  const names = new Map<string, string>();
  if (staffIds.length > 0) {
    const { data: staffRows, error: staffError } = await admin
      .from("staff_profiles")
      .select("id, display_name, username")
      .in("id", staffIds);
    if (staffError) {
      throw staffError;
    }
    for (const staff of staffRows ?? []) {
      names.set(String(staff.id), staffDisplayName(staff));
    }
  }

  return rows.flatMap((row) => {
    const eventType = String(row.event_type ?? "");
    if (!isStaffCredentialEventType(eventType)) return [];
    const metadata =
      row.metadata &&
      typeof row.metadata === "object" &&
      !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    const actorId =
      typeof row.actor_staff_id === "string" ? row.actor_staff_id : "";
    const subjectId =
      typeof row.subject_staff_id === "string" ? row.subject_staff_id : "";
    return [
      {
        id: String(row.id),
        eventType,
        label: STAFF_CREDENTIAL_EVENT_LABELS[eventType],
        createdAt: String(row.created_at),
        actorName: names.get(actorId) ?? "Unknown staff",
        subjectName: names.get(subjectId) ?? "Unknown staff",
        detail: formatStaffCredentialActivityDetail(eventType, metadata),
      },
    ];
  });
}
