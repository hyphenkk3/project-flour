"use server";

import { redirect } from "next/navigation";
import { requireStaff } from "@/foundation/auth/session";
import { canManageStaff } from "@/foundation/navigation/access";
import {
  isValidStaffCredentialActivityCursor,
  listStaffCredentialEventsPageForAdmin,
  type StaffCredentialActivityCursor,
} from "@/foundation/staff/credential-audit";

export async function loadOlderStaffCredentialActivityAction(
  cursor: StaffCredentialActivityCursor,
) {
  const actor = await requireStaff();
  if (!canManageStaff(actor.role.code)) redirect("/settings");
  if (!isValidStaffCredentialActivityCursor(cursor)) {
    return {
      ok: false as const,
      error: "Could not load older credential activity.",
    };
  }
  try {
    return {
      ok: true as const,
      page: await listStaffCredentialEventsPageForAdmin(cursor),
    };
  } catch {
    return {
      ok: false as const,
      error: "Could not load older credential activity.",
    };
  }
}
