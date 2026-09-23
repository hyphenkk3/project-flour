"use server";

import { redirect } from "next/navigation";
import { resolvePostLoginDestination } from "@/foundation/auth/post-login-destination";
import { requireStaff } from "@/foundation/auth/session";
import { STAFF_FORCED_PASSWORD_COPY } from "@/foundation/staff/forced-password-change";
import {
  mapPasswordUpdateError,
  validateForcedPasswordChangeInput,
} from "@/foundation/staff/password-update";
import { recordStaffCredentialEvent } from "@/foundation/staff/credential-audit";
import { createServiceClient } from "@/lib/supabase/admin";

export type ForcedPasswordChangeResult = {
  error: string | null;
  success: boolean;
};

export async function completeForcedPasswordChangeAction(
  formData: FormData,
): Promise<ForcedPasswordChangeResult> {
  const staff = await requireStaff();

  if (!staff.mustChangePassword) {
    return {
      error: STAFF_FORCED_PASSWORD_COPY.notRequired,
      success: false,
    };
  }

  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const validationError = validateForcedPasswordChangeInput({
    newPassword,
    confirmPassword,
  });
  if (validationError) {
    return { error: validationError, success: false };
  }

  const admin = createServiceClient();
  const { error: authError } = await admin.auth.admin.updateUserById(
    staff.authUserId,
    {
      password: newPassword,
    },
  );

  if (authError) {
    return { error: mapPasswordUpdateError(authError), success: false };
  }

  const { error: flagError } = await admin
    .from("staff_profiles")
    .update({
      must_change_password: false,
    })
    .eq("id", staff.id)
    .eq("auth_user_id", staff.authUserId);

  if (flagError) {
    const retry = await admin
      .from("staff_profiles")
      .update({
        must_change_password: false,
      })
      .eq("id", staff.id)
      .eq("auth_user_id", staff.authUserId);

    if (retry.error) {
      return {
        error: STAFF_FORCED_PASSWORD_COPY.flagClearFailed,
        success: false,
      };
    }
  }

  await recordStaffCredentialEvent({
    eventType: "password_changed",
    actorStaffId: staff.id,
    subjectStaffId: staff.id,
    metadata: {
      source: "forced_reset_completion",
    },
  });

  redirect(resolvePostLoginDestination(staff.role.code));
}
