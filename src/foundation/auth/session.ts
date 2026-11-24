import { cache } from "react";
import { redirect } from "next/navigation";
import { getStaffByAuthUserId } from "@/foundation/staff/queries";
import { createClient } from "@/lib/supabase/server";
import { AUTH_FETCH_TIMEOUT_MS } from "@/lib/supabase/fetch-timeout";
import {
  isTransientSessionVerificationError,
  StaffSessionVerificationUnavailable,
} from "@/foundation/auth/session-errors";
import type { StaffProfile } from "@/types/staff";

export type SessionDiagnosticObserver = {
  onAuthVerification?: (
    outcome: "verified" | "signed_out" | "rejected" | "temporarily_unavailable",
  ) => void;
  onProfileVerification?: (
    outcome: "active" | "inactive_or_missing" | "unavailable",
  ) => void;
  onAuthCookieMutation?: (kind: "written" | "cleared") => void;
  onSessionRefresh?: (outcome: "refreshed") => void;
};

/**
 * Request-scoped staff session lookup.
 * Cached so nested layouts (e.g. Customer Operations) do not repeat auth work.
 */
export const getSessionStaff = cache(
  async (
    observer?: SessionDiagnosticObserver,
  ): Promise<StaffProfile | null> => {
    try {
      const supabase = await createClient({
        timeoutMs: AUTH_FETCH_TIMEOUT_MS,
        onAuthCookieMutation: observer?.onAuthCookieMutation,
      });
      const {
        data: { subscription: authEventSubscription },
      } = supabase.auth.onAuthStateChange((event) => {
        if (event === "TOKEN_REFRESHED") {
          observer?.onSessionRefresh?.("refreshed");
        }
      });
      let user: Awaited<
        ReturnType<typeof supabase.auth.getUser>
      >["data"]["user"];
      let error: Awaited<ReturnType<typeof supabase.auth.getUser>>["error"];
      try {
        ({
          data: { user },
          error,
        } = await supabase.auth.getUser());
      } finally {
        authEventSubscription.unsubscribe();
      }

      if (error && isTransientSessionVerificationError(error)) {
        observer?.onAuthVerification?.("temporarily_unavailable");
        throw new StaffSessionVerificationUnavailable();
      }

      if (!user) {
        observer?.onAuthVerification?.(error ? "rejected" : "signed_out");
        return null;
      }

      observer?.onAuthVerification?.("verified");

      let staff: StaffProfile | null;
      try {
        staff = await getStaffByAuthUserId(user.id);
      } catch (error) {
        observer?.onProfileVerification?.("unavailable");
        throw error;
      }

      if (!staff || !staff.isActive) {
        observer?.onProfileVerification?.("inactive_or_missing");
        await supabase.auth.signOut();
        return null;
      }

      observer?.onProfileVerification?.("active");
      return staff;
    } catch (error) {
      if (
        error instanceof StaffSessionVerificationUnavailable ||
        isTransientSessionVerificationError(error)
      ) {
        observer?.onAuthVerification?.("temporarily_unavailable");
        throw new StaffSessionVerificationUnavailable();
      }
      observer?.onProfileVerification?.("unavailable");
      return null;
    }
  },
);

export async function requireStaff(): Promise<StaffProfile> {
  let staff: StaffProfile | null;
  try {
    staff = await getSessionStaff();
  } catch (error) {
    if (error instanceof StaffSessionVerificationUnavailable) {
      redirect("/auth/session-check");
    }
    throw error;
  }

  if (!staff) {
    redirect("/login");
  }

  return staff;
}
