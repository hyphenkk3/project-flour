"use server";

import { requireStaff } from "@/foundation/auth/session";
import { canManageStaff } from "@/foundation/navigation/access";
import {
  STAFF_ADMIN_COPY,
  staffAdminActorError,
  staffAdminPasswordResetError,
} from "@/foundation/staff/admin-guards";
import { mapPasswordUpdateError } from "@/foundation/staff/password-update";
import {
  type AdminPasswordResetAuthStatus,
  resolveAdminPasswordResetOutcome,
} from "@/foundation/staff/password-reset-outcome";
import { getStaffProfileByIdForAdmin } from "@/foundation/staff/queries";
import { generateTemporaryStaffPassword } from "@/foundation/staff/temporary-password";
import { createServiceClient } from "@/lib/supabase/admin";
import type { StaffProfile } from "@/types/staff";

export type StaffAdminPasswordResetResult = {
  error: string | null;
  success: boolean;
  temporaryPassword: string | null;
  warning: string | null;
};

function emptyResetResult(error: string): StaffAdminPasswordResetResult {
  return {
    error,
    success: false,
    temporaryPassword: null,
    warning: null,
  };
}

async function requireStaffAdmin(): Promise<
  | { ok: true; staff: StaffProfile }
  | { ok: false; result: StaffAdminPasswordResetResult }
> {
  const staff = await requireStaff();
  const actorError = staffAdminActorError(staff.role.code);
  if (actorError || !canManageStaff(staff.role.code)) {
    return {
      ok: false,
      result: emptyResetResult(actorError ?? STAFF_ADMIN_COPY.unauthorized),
    };
  }
  return { ok: true, staff };
}

async function markMustChangePassword(
  admin: ReturnType<typeof createServiceClient>,
  staffId: string,
): Promise<{ error: string | null }> {
  const { error } = await admin
    .from("staff_profiles")
    .update({
      must_change_password: true,
    })
    .eq("id", staffId);

  if (!error) {
    return { error: null };
  }

  const retry = await admin
    .from("staff_profiles")
    .update({
      must_change_password: true,
    })
    .eq("id", staffId);

  return { error: retry.error?.message ?? error.message };
}

async function clearMustChangePassword(
  admin: ReturnType<typeof createServiceClient>,
  staffId: string,
): Promise<{ error: string | null }> {
  const { error } = await admin
    .from("staff_profiles")
    .update({
      must_change_password: false,
    })
    .eq("id", staffId);

  if (!error) {
    return { error: null };
  }

  const retry = await admin
    .from("staff_profiles")
    .update({
      must_change_password: false,
    })
    .eq("id", staffId);

  return { error: retry.error?.message ?? error.message };
}

async function signOutStaffGlobally(
  admin: ReturnType<typeof createServiceClient>,
  authUserId: string,
): Promise<{ error: string | null }> {
  const { error } = await admin.auth.admin.signOut(authUserId, "global");
  if (!error) {
    return { error: null };
  }

  const retry = await admin.auth.admin.signOut(authUserId, "global");
  return { error: retry.error?.message ?? error.message };
}

export async function resetManagedStaffPasswordAction(
  formData: FormData,
): Promise<StaffAdminPasswordResetResult> {
  const actorResult = await requireStaffAdmin();
  if (!actorResult.ok) return actorResult.result;
  const actor = actorResult.staff;

  const targetId = String(formData.get("staffId") ?? "").trim();
  if (!targetId) {
    return emptyResetResult(STAFF_ADMIN_COPY.notFound);
  }

  const target = await getStaffProfileByIdForAdmin(targetId);
  if (!target) {
    return emptyResetResult(STAFF_ADMIN_COPY.notFound);
  }

  const resetError = staffAdminPasswordResetError({
    actorStaffId: actor.id,
    targetStaffId: target.id,
    actorRole: actor.role.code,
    targetRoleIsOwner: target.role.code === "owner",
    targetIsMasterOwner: target.isMasterOwner,
  });
  if (resetError) {
    return emptyResetResult(resetError);
  }

  const admin = createServiceClient();
  const flagResult = await markMustChangePassword(admin, target.id);
  if (flagResult.error) {
    return emptyResetResult(STAFF_ADMIN_COPY.resetFlagFailed);
  }

  const temporaryPassword = generateTemporaryStaffPassword();
  let authStatus: AdminPasswordResetAuthStatus = "uncertain";
  let authError: unknown = null;

  try {
    const { error } = await admin.auth.admin.updateUserById(target.authUserId, {
      password: temporaryPassword,
    });
    if (error) {
      authStatus = "failed";
      authError = error;
    } else {
      authStatus = "success";
    }
  } catch {
    authStatus = "uncertain";
  }

  let signOutFailed = false;
  if (authStatus === "success") {
    const signOutResult = await signOutStaffGlobally(admin, target.authUserId);
    signOutFailed = Boolean(signOutResult.error);
  }

  const outcome = resolveAdminPasswordResetOutcome({
    flagSet: true,
    authStatus,
    signOutFailed,
  });

  if (outcome.revertFlag) {
    await clearMustChangePassword(admin, target.id);
  }

  if (!outcome.success) {
    const error =
      authStatus === "failed" && authError
        ? mapPasswordUpdateError(authError)
        : (outcome.errorCopy ?? STAFF_ADMIN_COPY.resetFailed);
    return emptyResetResult(error);
  }

  return {
    error: null,
    success: true,
    temporaryPassword: outcome.returnTemporaryPassword
      ? temporaryPassword
      : null,
    warning: outcome.warningCopy,
  };
}
