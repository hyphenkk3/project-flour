"use server";

import { requireStaff } from "@/foundation/auth/session";
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

  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user || user.id !== staff.authUserId) {
    return {
      error: "Your staff session could not be verified. Please sign in again.",
      success: false,
    };
  }

  const currentEmail = user.email?.trim().toLowerCase() ?? "";

  if (currentEmail === email) {
    return {
      error: null,
      success: true,
    };
  }

  const { error: authError } = await supabase.auth.updateUser(
    { email },
    {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  );

  if (authError) {
    return {
      error: authError.message,
      success: false,
    };
  }

  return {
    error: null,
    success: true,
  };
}
