import { STAFF_ADMIN_COPY } from "@/foundation/staff/admin-guards";

export type AdminPasswordResetAuthStatus = "success" | "failed" | "uncertain";

export type AdminPasswordResetOutcome = {
  success: boolean;
  returnTemporaryPassword: boolean;
  revertFlag: boolean;
  errorCopy: string | null;
  warningCopy: string | null;
};

/**
 * Fail-closed decision table for admin password reset.
 * Auth and Postgres are not one transaction; this encodes the safe leftover state.
 */
export function resolveAdminPasswordResetOutcome(input: {
  flagSet: boolean;
  authStatus: AdminPasswordResetAuthStatus;
  signOutFailed: boolean;
}): AdminPasswordResetOutcome {
  if (!input.flagSet) {
    return {
      success: false,
      returnTemporaryPassword: false,
      revertFlag: false,
      errorCopy: STAFF_ADMIN_COPY.resetFlagFailed,
      warningCopy: null,
    };
  }

  if (input.authStatus === "failed") {
    return {
      success: false,
      returnTemporaryPassword: false,
      revertFlag: true,
      errorCopy: STAFF_ADMIN_COPY.resetFailed,
      warningCopy: null,
    };
  }

  if (input.authStatus === "uncertain") {
    return {
      success: false,
      returnTemporaryPassword: false,
      revertFlag: false,
      errorCopy: STAFF_ADMIN_COPY.resetUncertain,
      warningCopy: null,
    };
  }

  return {
    success: true,
    returnTemporaryPassword: true,
    revertFlag: false,
    errorCopy: null,
    warningCopy: input.signOutFailed
      ? STAFF_ADMIN_COPY.resetSessionWarning
      : null,
  };
}
