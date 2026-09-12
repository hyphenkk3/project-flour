/**
 * Admin password reset and forced password-change wiring.
 * Run: npx tsx scripts/test-staff-password-reset.ts
 *
 * Live Auth round-trips are not executed here. Do not reset wee, kin, lex,
 * or lily from this harness.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isNextRedirectError } from "@/foundation/auth/next-redirect";
import { STAFF_ADMIN_COPY } from "@/foundation/staff/admin-guards";
import { STAFF_FORCED_PASSWORD_CHANGE_PATH } from "@/foundation/staff/forced-password-change";
import { resolveAdminPasswordResetOutcome } from "@/foundation/staff/password-reset-outcome";
import {
  STAFF_PASSWORD_COPY,
  validateForcedPasswordChangeInput,
} from "@/foundation/staff/password-update";
import { generateTemporaryStaffPassword } from "@/foundation/staff/temporary-password";

assert.equal(STAFF_FORCED_PASSWORD_CHANGE_PATH, "/staff/complete-password-change");

assert.equal(
  isNextRedirectError({ digest: "NEXT_REDIRECT;push;/staff/complete-password-change;307;" }),
  true,
);
assert.equal(isNextRedirectError({ message: "NEXT_REDIRECT" }), true);
assert.equal(isNextRedirectError({ message: "password update failed" }), false);
assert.equal(isNextRedirectError("NEXT_REDIRECT"), false);

assert.deepEqual(
  resolveAdminPasswordResetOutcome({
    flagSet: false,
    authStatus: "success",
    signOutFailed: false,
  }),
  {
    success: false,
    returnTemporaryPassword: false,
    revertFlag: false,
    errorCopy: STAFF_ADMIN_COPY.resetFlagFailed,
    warningCopy: null,
  },
);
assert.deepEqual(
  resolveAdminPasswordResetOutcome({
    flagSet: true,
    authStatus: "failed",
    signOutFailed: false,
  }),
  {
    success: false,
    returnTemporaryPassword: false,
    revertFlag: true,
    errorCopy: STAFF_ADMIN_COPY.resetFailed,
    warningCopy: null,
  },
);
assert.deepEqual(
  resolveAdminPasswordResetOutcome({
    flagSet: true,
    authStatus: "uncertain",
    signOutFailed: false,
  }),
  {
    success: false,
    returnTemporaryPassword: false,
    revertFlag: false,
    errorCopy: STAFF_ADMIN_COPY.resetUncertain,
    warningCopy: null,
  },
);
assert.deepEqual(
  resolveAdminPasswordResetOutcome({
    flagSet: true,
    authStatus: "success",
    signOutFailed: true,
  }),
  {
    success: true,
    returnTemporaryPassword: true,
    revertFlag: false,
    errorCopy: null,
    warningCopy: STAFF_ADMIN_COPY.resetSessionWarning,
  },
);
assert.deepEqual(
  resolveAdminPasswordResetOutcome({
    flagSet: true,
    authStatus: "success",
    signOutFailed: false,
  }),
  {
    success: true,
    returnTemporaryPassword: true,
    revertFlag: false,
    errorCopy: null,
    warningCopy: null,
  },
);
assert.equal(
  resolveAdminPasswordResetOutcome({
    flagSet: true,
    authStatus: "failed",
    signOutFailed: true,
  }).revertFlag,
  true,
);
assert.equal(
  resolveAdminPasswordResetOutcome({
    flagSet: true,
    authStatus: "success",
    signOutFailed: true,
  }).revertFlag,
  false,
);

assert.equal(
  validateForcedPasswordChangeInput({
    newPassword: "new-secret",
    confirmPassword: "new-secret",
  }),
  null,
);
assert.equal(
  validateForcedPasswordChangeInput({
    newPassword: "",
    confirmPassword: "new-secret",
  }),
  STAFF_PASSWORD_COPY.blank,
);
assert.equal(
  validateForcedPasswordChangeInput({
    newPassword: "new-secret",
    confirmPassword: "other-secret",
  }),
  STAFF_PASSWORD_COPY.mismatch,
);
assert.equal(
  validateForcedPasswordChangeInput({
    newPassword: "12345",
    confirmPassword: "12345",
  }),
  STAFF_PASSWORD_COPY.weak,
);

const generated = generateTemporaryStaffPassword();
assert.equal(generated.length, 16);
assert.match(generated, /^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789]+$/);
assert.notEqual(generateTemporaryStaffPassword(), generated);

const generatorSource = readFileSync(
  resolve("src/foundation/staff/temporary-password.ts"),
  "utf8",
);
assert.match(generatorSource, /randomBytes/);
assert.doesNotMatch(generatorSource, /Math\.random/);

const resetActions = readFileSync(
  resolve("src/foundation/staff/admin-password-actions.ts"),
  "utf8",
);
assert.match(resetActions, /export async function resetManagedStaffPasswordAction/);
assert.match(resetActions, /requireStaff\(\)/);
assert.match(resetActions, /canManageStaff/);
assert.match(resetActions, /targetIsArchived:\s*Boolean\(target\.archivedAt\)/);
assert.match(resetActions, /actorRole:\s*actor\.role\.code/);
assert.match(resetActions, /getStaffProfileByIdForAdmin\(targetId\)/);
assert.match(resetActions, /generateTemporaryStaffPassword/);
assert.match(resetActions, /updateUserById\(\s*target\.authUserId/);
assert.match(resetActions, /password:\s*temporaryPassword/);
assert.match(resetActions, /must_change_password:\s*true/);
assert.match(resetActions, /signOut\(authUserId,\s*"global"\)/);
assert.match(resetActions, /resolveAdminPasswordResetOutcome/);
assert.match(resetActions, /authStatus = "uncertain"/);
assert.match(resetActions, /if \(outcome\.revertFlag\)/);
assert.match(resetActions, /must_change_password:\s*false/);
assert.match(resetActions, /formData\.get\("staffId"\)/);
assert.ok(
  resetActions.indexOf("await markMustChangePassword") <
    resetActions.indexOf("updateUserById(target.authUserId"),
);
assert.ok(
  resetActions.indexOf("STAFF_ADMIN_COPY.resetFlagFailed") <
    resetActions.indexOf("updateUserById(target.authUserId"),
);
assert.ok(
  resetActions.indexOf("updateUserById(target.authUserId") <
    resetActions.indexOf("await signOutStaffGlobally"),
);
assert.ok(
  resetActions.indexOf("if (outcome.revertFlag)") <
    resetActions.indexOf("await clearMustChangePassword"),
);
assert.ok(
  resetActions.indexOf("if (outcome.revertFlag)") <
    resetActions.indexOf("if (!outcome.success)"),
);
assert.match(resetActions, /if \(authStatus === "success"\)/);
assert.match(resetActions, /emptyResetResult\(error\)/);
assert.doesNotMatch(resetActions, /formData\.get\("authUserId"\)/);
assert.doesNotMatch(resetActions, /formData\.get\("password"\)/);
assert.doesNotMatch(resetActions, /Math\.random/);
assert.doesNotMatch(resetActions, /console\.(log|info|debug|warn|error)/);
assert.doesNotMatch(resetActions, /localStorage|sessionStorage/);
assert.doesNotMatch(resetActions, /resetPasswordForEmail|generateLink/);
assert.doesNotMatch(resetActions, /is_master_owner/);

const completeActions = readFileSync(
  resolve("src/foundation/staff/complete-password-change-actions.ts"),
  "utf8",
);
assert.match(completeActions, /export async function completeForcedPasswordChangeAction/);
assert.match(completeActions, /requireStaff\(\)/);
assert.match(completeActions, /mustChangePassword/);
assert.match(completeActions, /validateForcedPasswordChangeInput/);
assert.match(completeActions, /updateUserById\(\s*staff\.authUserId/);
assert.match(completeActions, /must_change_password:\s*false/);
assert.match(completeActions, /\.eq\("auth_user_id", staff\.authUserId\)/);
assert.match(completeActions, /resolvePostLoginDestination\(staff\.role\.code\)/);
assert.doesNotMatch(completeActions, /formData\.get\("staffId"\)/);
assert.doesNotMatch(completeActions, /formData\.get\("authUserId"\)/);
assert.doesNotMatch(completeActions, /current_password/);
assert.doesNotMatch(completeActions, /console\.(log|info|debug|warn|error)/);
assert.doesNotMatch(completeActions, /localStorage|sessionStorage/);

const adminActions = readFileSync(
  resolve("src/foundation/staff/admin-actions.ts"),
  "utf8",
);
assert.doesNotMatch(adminActions, /updateUserById/);
assert.doesNotMatch(adminActions, /resetManagedStaffPasswordAction/);
assert.doesNotMatch(adminActions, /must_change_password/);

const loginActions = readFileSync(
  resolve("src/foundation/auth/actions.ts"),
  "utf8",
);
assert.match(loginActions, /mustChangePassword = staff\.mustChangePassword/);
assert.match(
  loginActions,
  /if \(mustChangePassword\) \{\s*redirect\(STAFF_FORCED_PASSWORD_CHANGE_PATH\)/,
);
assert.match(
  loginActions,
  /completePasskeyLoginAction[\s\S]*staff\.mustChangePassword[\s\S]*STAFF_FORCED_PASSWORD_CHANGE_PATH/,
);
assert.match(
  loginActions,
  /completePasskeyLoginAction[\s\S]*resolvePostLoginDestination/,
);
assert.doesNotMatch(
  loginActions,
  /completePasskeyLoginAction[\s\S]*redirect\(/,
);

const appLayout = readFileSync(
  resolve("src/app/(app)/layout.tsx"),
  "utf8",
);
assert.match(appLayout, /staff\.mustChangePassword/);
assert.match(appLayout, /STAFF_FORCED_PASSWORD_CHANGE_PATH/);
assert.doesNotMatch(appLayout, /complete-password-change/);

const forcedPage = readFileSync(
  resolve("src/app/staff/complete-password-change/page.tsx"),
  "utf8",
);
assert.match(forcedPage, /requireStaff/);
assert.match(forcedPage, /!staff\.mustChangePassword/);
assert.match(forcedPage, /StaffForcedPasswordChangeForm/);
assert.match(forcedPage, /logoutAction/);
assert.doesNotMatch(forcedPage, /StaffPasswordSettings/);
assert.doesNotMatch(forcedPage, /localStorage|sessionStorage/);

const forcedForm = readFileSync(
  resolve("src/components/settings/StaffForcedPasswordChangeForm.tsx"),
  "utf8",
);
assert.match(forcedForm, /completeForcedPasswordChangeAction/);
assert.match(forcedForm, /name="newPassword"/);
assert.match(forcedForm, /name="confirmPassword"/);
assert.doesNotMatch(forcedForm, /currentPassword|Current password/);
assert.doesNotMatch(forcedForm, /from "@\/foundation\/auth\/passkeys"/);
assert.match(forcedForm, /from "@\/foundation\/auth\/next-redirect"/);
assert.doesNotMatch(forcedForm, /createServiceClient|SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(forcedForm, /localStorage|sessionStorage/);
assert.doesNotMatch(forcedForm, /console\.(log|info|debug|warn|error)/);

const directory = readFileSync(
  resolve("src/components/settings/StaffAdminDirectory.tsx"),
  "utf8",
);
assert.match(directory, /resetManagedStaffPasswordAction/);
assert.match(directory, /navigator\.clipboard\.writeText\(temporaryPassword\)/);
assert.doesNotMatch(directory, /localStorage|sessionStorage/);
assert.doesNotMatch(directory, /createServiceClient|SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(directory, /searchParams|location\.href|history\.pushState/);

const passkeys = readFileSync(
  resolve("src/foundation/auth/passkeys.ts"),
  "utf8",
);
assert.doesNotMatch(passkeys, /must_change_password|mustChangePassword/);
assert.doesNotMatch(passkeys, /updateUserById|createServiceClient/);
assert.doesNotMatch(passkeys, /resetManagedStaffPasswordAction/);
assert.doesNotMatch(passkeys, /completeForcedPasswordChangeAction/);
assert.match(passkeys, /from "@\/foundation\/auth\/next-redirect"/);
assert.match(passkeys, /export \{ isNextRedirectError \}/);

const nextRedirect = readFileSync(
  resolve("src/foundation/auth/next-redirect.ts"),
  "utf8",
);
assert.match(nextRedirect, /export function isNextRedirectError/);
assert.doesNotMatch(nextRedirect, /passkey|Passkey|webauthn/i);

const passwordSettings = readFileSync(
  resolve("src/components/settings/StaffPasswordSettings.tsx"),
  "utf8",
);
assert.match(passwordSettings, /currentPassword/);
assert.match(passwordSettings, /updateStaffPasswordAction/);
assert.doesNotMatch(passwordSettings, /resetManagedStaffPasswordAction/);
assert.doesNotMatch(passwordSettings, /completeForcedPasswordChangeAction/);
assert.doesNotMatch(passwordSettings, /mustChangePassword/);

const profileActions = readFileSync(
  resolve("src/foundation/staff/profile-actions.ts"),
  "utf8",
);
assert.match(profileActions, /current_password:\s*currentPassword/);
assert.match(profileActions, /auth\.updateUser/);
assert.doesNotMatch(
  profileActions,
  /updateStaffPasswordAction[\s\S]*createServiceClient/,
);
assert.doesNotMatch(profileActions, /must_change_password/);
assert.doesNotMatch(profileActions, /resetManagedStaffPasswordAction/);

const migration = readFileSync(
  resolve("supabase/migrations/20260912100000_staff_must_change_password.sql"),
  "utf8",
);
assert.match(
  migration,
  /add column if not exists must_change_password boolean not null default false/,
);
assert.doesNotMatch(migration, /enable row level security|create policy|drop policy/);
assert.doesNotMatch(migration, /update public\.staff_profiles\s+set must_change_password/i);
assert.doesNotMatch(migration, /is_master_owner/);

const clientSource = readFileSync(resolve("src/lib/supabase/client.ts"), "utf8");
assert.doesNotMatch(clientSource, /SERVICE_ROLE|createServiceClient/);

console.log("test-staff-password-reset: PASS");
