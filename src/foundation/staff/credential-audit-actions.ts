"use server";

import { requireStaff } from "@/foundation/auth/session";
import {
  recordStaffCredentialEvent,
  staffCredentialAuditWarning,
  type StaffCredentialEventType,
} from "@/foundation/staff/credential-audit";

const PASSKEY_KINDS = {
  added: "passkey_added",
  removed: "passkey_removed",
} as const;

export async function recordOwnPasskeyCredentialEventAction(input: {
  kind: "added" | "removed";
  label?: string;
}): Promise<{ error: string | null; success: boolean; warning?: string | null }> {
  const staff = await requireStaff();
  const eventType: StaffCredentialEventType | undefined =
    PASSKEY_KINDS[input.kind];
  if (!eventType) {
    return { error: "That Passkey change could not be recorded.", success: false };
  }

  const recorded = await recordStaffCredentialEvent({
    eventType,
    actorStaffId: staff.id,
    subjectStaffId: staff.id,
    metadata: {
      label: input.label?.trim() || "Passkey",
    },
  });

  return {
    error: null,
    success: true,
    warning: staffCredentialAuditWarning(recorded),
  };
}
