"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/foundation/auth/session";
import {
  mapPasswordUpdateError,
  validatePasswordChangeInput,
} from "@/foundation/staff/password-update";
import { findStaffByUsername } from "@/foundation/staff/queries";
import {
  STAFF_USERNAME_COPY,
  isUsernameFormatViolation,
  isUsernameUniqueViolation,
  normalizeStaffUsername,
  staffUsernamesMatch,
  validateStaffUsername,
} from "@/foundation/staff/username";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function normalizeEmail(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function updateStaffEmailAction(
  formData: FormData,
): Promise<{ error: string | null; success: boolean }> {
  const staff = await requireStaff();

  const email = normalizeEmail(formData.get("email"));

  if (!email) {
    return {
      error: "Please enter an email address.",
      success: false,
    };
  }

  if (!isValidEmail(email)) {
    return {
      error: "Please enter a valid email address.",
      success: false,
    };
  }

  const currentEmail = staff.email?.trim().toLowerCase() ?? "";

  if (currentEmail === email) {
    return {
      error: null,
      success: true,
    };
  }

  const admin = createServiceClient();

  // Update the Supabase Auth account directly.
  // This intentionally bypasses email-change confirmation because
  // staff emails are managed internally and may be dummy addresses.
  const { error: authError } = await admin.auth.admin.updateUserById(
    staff.authUserId,
    {
      email,
      email_confirm: true,
    },
  );

  if (authError) {
    return {
      error: authError.message,
      success: false,
    };
  }

  // Keep the staff profile email in sync so operational
  // notifications stop going to the old address.
  const { error: profileError } = await admin
    .from("staff_profiles")
    .update({
      email,
    })
    .eq("auth_user_id", staff.authUserId);

  if (profileError) {
    return {
      error: profileError.message,
      success: false,
    };
  }

  return {
    error: null,
    success: true,
  };
}

export async function updateStaffUsernameAction(
  formData: FormData,
): Promise<{ error: string | null; success: boolean }> {
  const staff = await requireStaff();
  const username = normalizeStaffUsername(String(formData.get("username") ?? ""));

  const validationError = validateStaffUsername(username);
  if (validationError) {
    return { error: validationError, success: false };
  }

  if (staffUsernamesMatch(username, staff.username)) {
    return { error: null, success: true };
  }

  const existing = await findStaffByUsername(username);
  if (existing && existing.id !== staff.id) {
    return { error: STAFF_USERNAME_COPY.taken, success: false };
  }

  const admin = createServiceClient();
  const { error: profileError } = await admin
    .from("staff_profiles")
    .update({
      username,
    })
    .eq("id", staff.id)
    .eq("auth_user_id", staff.authUserId);

  if (profileError) {
    if (isUsernameUniqueViolation(profileError)) {
      return { error: STAFF_USERNAME_COPY.taken, success: false };
    }
    if (isUsernameFormatViolation(profileError)) {
      return { error: STAFF_USERNAME_COPY.invalid, success: false };
    }
    return { error: STAFF_USERNAME_COPY.failed, success: false };
  }

  revalidatePath("/settings");
  return { error: null, success: true };
}

export async function updateStaffDisplayNameAction(
  formData: FormData,
): Promise<{ error: string | null; success: boolean }> {
  const staff = await requireStaff();
  const displayName = String(formData.get("displayName") ?? "").trim();

  if (!displayName) {
    return { error: "Please enter a display name.", success: false };
  }

  if (displayName === staff.displayName.trim()) {
    return { error: null, success: true };
  }

  const admin = createServiceClient();
  const { error: profileError } = await admin
    .from("staff_profiles")
    .update({
      display_name: displayName,
    })
    .eq("id", staff.id)
    .eq("auth_user_id", staff.authUserId);

  if (profileError) {
    return {
      error: "That display name couldn't be updated. Please try again.",
      success: false,
    };
  }

  revalidatePath("/settings");
  return { error: null, success: true };
}

export async function updateStaffPasswordAction(
  formData: FormData,
): Promise<{ error: string | null; success: boolean }> {
  await requireStaff();

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const validationError = validatePasswordChangeInput({
    currentPassword,
    newPassword,
    confirmPassword,
  });

  if (validationError) {
    return { error: validationError, success: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: newPassword,
    current_password: currentPassword,
  });

  if (error) {
    return { error: mapPasswordUpdateError(error), success: false };
  }

  return { error: null, success: true };
}
