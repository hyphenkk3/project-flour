import { cache } from "react";
import { redirect } from "next/navigation";
import { getStaffByAuthUserId } from "@/foundation/staff/queries";
import { createClient } from "@/lib/supabase/server";
import { AUTH_FETCH_TIMEOUT_MS } from "@/lib/supabase/fetch-timeout";
import type { StaffProfile } from "@/types/staff";

/**
 * Request-scoped staff session lookup.
 * Cached so nested layouts (e.g. Customer Operations) do not repeat auth work.
 */
export const getSessionStaff = cache(async (): Promise<StaffProfile | null> => {
  try {
    const supabase = await createClient({ timeoutMs: AUTH_FETCH_TIMEOUT_MS });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return null;
    }

    const staff = await getStaffByAuthUserId(user.id);

    if (!staff || !staff.isActive) {
      await supabase.auth.signOut();
      return null;
    }

    return staff;
  } catch {
    // Auth/network timeout or failure — treat as signed out.
    return null;
  }
});

export async function requireStaff(): Promise<StaffProfile> {
  const staff = await getSessionStaff();

  if (!staff) {
    redirect("/login");
  }

  return staff;
}
