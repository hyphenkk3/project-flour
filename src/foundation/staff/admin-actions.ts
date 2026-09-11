"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/foundation/auth/session";
import { canManageStaff } from "@/foundation/navigation/access";
import {
  STAFF_ADMIN_COPY,
  isStaffRoleCode,
  staffAdminActorError,
  staffAdminDeactivateError,
  staffAdminRoleChangeError,
  staffAdminUsernameChangeError,
} from "@/foundation/staff/admin-guards";
import { mapPasswordUpdateError } from "@/foundation/staff/password-update";
import {
  countActiveOwners,
  findStaffByUsername,
  getStaffProfileByIdForAdmin,
  listStaffRoles,
} from "@/foundation/staff/queries";
import {
  STAFF_USERNAME_COPY,
  isUsernameFormatViolation,
  isUsernameUniqueViolation,
  normalizeStaffUsername,
  staffUsernamesMatch,
  validateStaffUsername,
} from "@/foundation/staff/username";
import { createServiceClient } from "@/lib/supabase/admin";
import type { StaffProfile } from "@/types/staff";

export type StaffAdminActionResult = {
  error: string | null;
  success: boolean;
};

function revalidateStaffAdmin() {
  revalidatePath("/settings/staff");
  revalidatePath("/settings");
}

async function requireStaffAdmin(): Promise<
  { ok: true; staff: StaffProfile } | { ok: false; result: StaffAdminActionResult }
> {
  const staff = await requireStaff();
  const actorError = staffAdminActorError(staff.role.code);
  if (actorError || !canManageStaff(staff.role.code)) {
    return {
      ok: false,
      result: {
        error: actorError ?? STAFF_ADMIN_COPY.unauthorized,
        success: false,
      },
    };
  }
  return { ok: true, staff };
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function mapCreateAuthError(error: unknown): string {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
  const message =
    error && typeof error === "object" && "message" in error
      ? String(error.message).toLowerCase()
      : "";

  if (
    code === "email_exists" ||
    message.includes("already registered") ||
    message.includes("already been registered") ||
    message.includes("email address is already")
  ) {
    return STAFF_ADMIN_COPY.emailUnavailable;
  }

  if (
    code === "weak_password" ||
    message.includes("password") ||
    message.includes("weak")
  ) {
    return mapPasswordUpdateError(error);
  }

  return STAFF_ADMIN_COPY.createFailed;
}

export async function createStaffAccountAction(
  formData: FormData,
): Promise<StaffAdminActionResult> {
  const actorResult = await requireStaffAdmin();
  if (!actorResult.ok) return actorResult.result;

  const displayName = String(formData.get("displayName") ?? "").trim();
  const username = normalizeStaffUsername(String(formData.get("username") ?? ""));
  const roleCode = String(formData.get("role") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!displayName) {
    return { error: STAFF_ADMIN_COPY.emptyDisplayName, success: false };
  }

  const usernameError = validateStaffUsername(username);
  if (usernameError) {
    return { error: usernameError, success: false };
  }

  if (!isStaffRoleCode(roleCode)) {
    return { error: STAFF_ADMIN_COPY.invalidRole, success: false };
  }

  if (!email || !isValidEmail(email)) {
    return { error: STAFF_ADMIN_COPY.invalidEmail, success: false };
  }

  if (!password) {
    return { error: STAFF_ADMIN_COPY.emptyPassword, success: false };
  }

  if (password !== confirmPassword) {
    return { error: STAFF_ADMIN_COPY.passwordMismatch, success: false };
  }

  const existing = await findStaffByUsername(username);
  if (existing) {
    return { error: STAFF_USERNAME_COPY.taken, success: false };
  }

  const roles = await listStaffRoles();
  const role = roles.find((item) => item.code === roleCode);
  if (!role) {
    return { error: STAFF_ADMIN_COPY.invalidRole, success: false };
  }

  const admin = createServiceClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      username,
      display_name: displayName,
    },
  });

  if (createError || !created.user?.id) {
    return {
      error: mapCreateAuthError(createError ?? STAFF_ADMIN_COPY.createFailed),
      success: false,
    };
  }

  const authUserId = created.user.id;
  const { error: profileError } = await admin.from("staff_profiles").insert({
    auth_user_id: authUserId,
    username,
    email,
    display_name: displayName,
    role_id: role.id,
    is_active: true,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(authUserId).catch(() => undefined);
    if (isUsernameUniqueViolation(profileError)) {
      return { error: STAFF_USERNAME_COPY.taken, success: false };
    }
    if (isUsernameFormatViolation(profileError)) {
      return { error: STAFF_USERNAME_COPY.invalid, success: false };
    }
    return { error: STAFF_ADMIN_COPY.createFailed, success: false };
  }

  revalidateStaffAdmin();
  return { error: null, success: true };
}

export async function updateManagedStaffUsernameAction(
  formData: FormData,
): Promise<StaffAdminActionResult> {
  const actorResult = await requireStaffAdmin();
  if (!actorResult.ok) return actorResult.result;
  const actor = actorResult.staff;
  const targetId = String(formData.get("staffId") ?? "").trim();
  const username = normalizeStaffUsername(String(formData.get("username") ?? ""));

  const ownUsernameError = staffAdminUsernameChangeError({
    actorStaffId: actor.id,
    targetStaffId: targetId,
  });
  if (ownUsernameError) {
    return { error: ownUsernameError, success: false };
  }

  const usernameError = validateStaffUsername(username);
  if (usernameError) {
    return { error: usernameError, success: false };
  }

  const target = await getStaffProfileByIdForAdmin(targetId);
  if (!target) {
    return { error: STAFF_ADMIN_COPY.notFound, success: false };
  }

  if (staffUsernamesMatch(username, target.username)) {
    return { error: null, success: true };
  }

  const existing = await findStaffByUsername(username);
  if (existing && existing.id !== target.id) {
    return { error: STAFF_USERNAME_COPY.taken, success: false };
  }

  const admin = createServiceClient();
  const { error: profileError } = await admin
    .from("staff_profiles")
    .update({
      username,
    })
    .eq("id", target.id);

  if (profileError) {
    if (isUsernameUniqueViolation(profileError)) {
      return { error: STAFF_USERNAME_COPY.taken, success: false };
    }
    if (isUsernameFormatViolation(profileError)) {
      return { error: STAFF_USERNAME_COPY.invalid, success: false };
    }
    return { error: STAFF_ADMIN_COPY.updateFailed, success: false };
  }

  revalidateStaffAdmin();
  return { error: null, success: true };
}

export async function updateManagedStaffRoleAction(
  formData: FormData,
): Promise<StaffAdminActionResult> {
  const actorResult = await requireStaffAdmin();
  if (!actorResult.ok) return actorResult.result;
  const actor = actorResult.staff;
  const targetId = String(formData.get("staffId") ?? "").trim();
  const roleCode = String(formData.get("role") ?? "").trim();

  if (!isStaffRoleCode(roleCode)) {
    return { error: STAFF_ADMIN_COPY.invalidRole, success: false };
  }

  const target = await getStaffProfileByIdForAdmin(targetId);
  if (!target) {
    return { error: STAFF_ADMIN_COPY.notFound, success: false };
  }

  const roles = await listStaffRoles();
  const role = roles.find((item) => item.code === roleCode);
  if (!role) {
    return { error: STAFF_ADMIN_COPY.invalidRole, success: false };
  }

  const activeOwnerCount = await countActiveOwners();
  const roleError = staffAdminRoleChangeError({
    actorStaffId: actor.id,
    targetStaffId: target.id,
    targetIsActiveOwner: target.isActive && target.role.code === "owner",
    nextRoleIsOwner: role.code === "owner",
    activeOwnerCount,
  });
  if (roleError) {
    return { error: roleError, success: false };
  }

  if (target.role.id === role.id) {
    return { error: null, success: true };
  }

  const admin = createServiceClient();
  const { error: profileError } = await admin
    .from("staff_profiles")
    .update({
      role_id: role.id,
    })
    .eq("id", target.id);

  if (profileError) {
    return { error: STAFF_ADMIN_COPY.updateFailed, success: false };
  }

  revalidateStaffAdmin();
  return { error: null, success: true };
}

export async function setManagedStaffActiveAction(
  formData: FormData,
): Promise<StaffAdminActionResult> {
  const actorResult = await requireStaffAdmin();
  if (!actorResult.ok) return actorResult.result;
  const actor = actorResult.staff;
  const targetId = String(formData.get("staffId") ?? "").trim();
  const nextActive = String(formData.get("isActive") ?? "") === "true";

  const target = await getStaffProfileByIdForAdmin(targetId);
  if (!target) {
    return { error: STAFF_ADMIN_COPY.notFound, success: false };
  }

  if (target.isActive === nextActive) {
    return { error: null, success: true };
  }

  if (!nextActive) {
    const activeOwnerCount = await countActiveOwners();
    const deactivateError = staffAdminDeactivateError({
      actorStaffId: actor.id,
      targetStaffId: target.id,
      targetIsActiveOwner: target.isActive && target.role.code === "owner",
      activeOwnerCount,
    });
    if (deactivateError) {
      return { error: deactivateError, success: false };
    }
  }

  const admin = createServiceClient();
  const { error: profileError } = await admin
    .from("staff_profiles")
    .update({
      is_active: nextActive,
    })
    .eq("id", target.id);

  if (profileError) {
    return { error: STAFF_ADMIN_COPY.updateFailed, success: false };
  }

  revalidateStaffAdmin();
  return { error: null, success: true };
}
