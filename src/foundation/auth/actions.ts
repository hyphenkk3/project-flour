"use server";

import { redirect } from "next/navigation";
import { PASSKEY_COPY } from "@/foundation/auth/passkeys";
import {
  resolvePostLoginDestination,
  sanitizePostLoginPath,
} from "@/foundation/auth/post-login-destination";
import { getSessionStaff } from "@/foundation/auth/session";
import { STAFF_FORCED_PASSWORD_CHANGE_PATH } from "@/foundation/staff/forced-password-change";
import {
  findStaffByUsername,
  getAuthEmailForUserId,
} from "@/foundation/staff/queries";
import { createClient } from "@/lib/supabase/server";
import type { RoleCode } from "@/types/staff";

export type LoginState = {
  error: string | null;
};

export type PasskeyLoginCompletion =
  | { ok: true; destination: string }
  | { ok: false; error: string };

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
  let mustChangePassword = false;

  try {
    const staff = await findStaffByUsername(username);

    if (!staff || !staff.isActive) {
      return { error: genericLoginError };
    }

    roleCode = staff.role.code;
    mustChangePassword = staff.mustChangePassword;

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

  if (mustChangePassword) {
    redirect(STAFF_FORCED_PASSWORD_CHANGE_PATH);
  }

  redirect(resolvePostLoginDestination(roleCode, requestedNext));
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * After a browser Passkey ceremony writes a normal Auth session cookie,
 * confirm staff and return the existing post-login destination.
 *
 * Do not `redirect()` here: the login form awaits this action in a try/catch,
 * and Next.js redirect errors were being shown as Passkey failures.
 */
export async function completePasskeyLoginAction(
  requestedNext?: string | null,
): Promise<PasskeyLoginCompletion> {
  const staff = await getSessionStaff();

  if (!staff) {
    return { ok: false, error: PASSKEY_COPY.failedSignIn };
  }

  if (staff.mustChangePassword) {
    return {
      ok: true,
      destination: STAFF_FORCED_PASSWORD_CHANGE_PATH,
    };
  }

  return {
    ok: true,
    destination: resolvePostLoginDestination(
      staff.role.code,
      sanitizePostLoginPath(requestedNext),
    ),
  };
}
