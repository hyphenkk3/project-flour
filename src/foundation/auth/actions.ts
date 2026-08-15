"use server";

import { redirect } from "next/navigation";
import { resolvePostLoginDestination } from "@/foundation/auth/post-login-destination";
import {
  findStaffByUsername,
  getAuthEmailForUserId,
} from "@/foundation/staff/queries";
import { createClient } from "@/lib/supabase/server";
import type { RoleCode } from "@/types/staff";

export type LoginState = {
  error: string | null;
};

const genericLoginError = "Invalid username or password.";

export async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const requestedNext = String(formData.get("next") ?? "").trim() || null;

  if (!username || !password) {
    return { error: genericLoginError };
  }

  let roleCode: RoleCode | null = null;

  try {
    const staff = await findStaffByUsername(username);

    if (!staff || !staff.isActive) {
      return { error: genericLoginError };
    }

    roleCode = staff.role.code;

    const authEmail = await getAuthEmailForUserId(staff.authUserId);

    if (!authEmail) {
      return { error: genericLoginError };
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password,
    });

    if (error) {
      return { error: genericLoginError };
    }
  } catch {
    return { error: genericLoginError };
  }

  if (!roleCode) {
    return { error: genericLoginError };
  }

  redirect(resolvePostLoginDestination(roleCode, requestedNext));
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
