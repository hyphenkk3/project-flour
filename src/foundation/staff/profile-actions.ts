"use server";

import { requireStaff } from "@/foundation/auth/session";
import { createServiceClient } from "@/lib/supabase/admin";

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
