/**
 * Staff username and password management.
 * Run: npx tsx scripts/test-staff-credentials.ts
 *
 * Live browser/session timing and two-account uniqueness races are not
 * reproduced in this harness. Those are covered by validation helpers,
 * action wiring, and the existing unique constraint on staff_profiles.username.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  STAFF_PASSWORD_COPY,
  mapPasswordUpdateError,
  validatePasswordChangeInput,
} from "@/foundation/staff/password-update";
import {
  STAFF_USERNAME_COPY,
  isUsernameFormatViolation,
  isUsernameUniqueViolation,
  normalizeStaffUsername,
  staffUsernamesMatch,
  validateStaffUsername,
} from "@/foundation/staff/username";

assert.equal(normalizeStaffUsername("  owner.dev  "), "owner.dev");
assert.equal(validateStaffUsername(""), STAFF_USERNAME_COPY.empty);
assert.equal(validateStaffUsername("   "), STAFF_USERNAME_COPY.empty);
assert.equal(validateStaffUsername("ab"), STAFF_USERNAME_COPY.invalid);
assert.equal(validateStaffUsername("bad name"), STAFF_USERNAME_COPY.invalid);
assert.equal(validateStaffUsername("ok_user-1"), null);
assert.equal(staffUsernamesMatch("Owner.Dev", "owner.dev"), true);
assert.equal(staffUsernamesMatch("owner.dev", "other.dev"), false);
assert.equal(isUsernameUniqueViolation({ code: "23505" }), true);
assert.equal(isUsernameFormatViolation({ code: "23514" }), true);

assert.equal(
  validatePasswordChangeInput({
    currentPassword: "old-secret",
    newPassword: "new-secret",
    confirmPassword: "new-secret",
  }),
  null,
);
assert.equal(
  validatePasswordChangeInput({
    currentPassword: "",
    newPassword: "new-secret",
    confirmPassword: "new-secret",
  }),
  STAFF_PASSWORD_COPY.blank,
);
assert.equal(
  validatePasswordChangeInput({
    currentPassword: "old-secret",
    newPassword: "new-secret",
    confirmPassword: "other-secret",
  }),
  STAFF_PASSWORD_COPY.mismatch,
);
assert.equal(
  validatePasswordChangeInput({
    currentPassword: "same-secret",
    newPassword: "same-secret",
    confirmPassword: "same-secret",
  }),
  STAFF_PASSWORD_COPY.sameAsCurrent,
);

assert.equal(
  mapPasswordUpdateError({ code: "weak_password" }),
  STAFF_PASSWORD_COPY.weak,
);
assert.equal(
  mapPasswordUpdateError({
    name: "AuthWeakPasswordError",
    message: "Password should be at least 6 characters.",
  }),
  STAFF_PASSWORD_COPY.weak,
);
assert.equal(
  mapPasswordUpdateError({ message: "Invalid login credentials" }),
  STAFF_PASSWORD_COPY.currentIncorrect,
);
assert.equal(
  mapPasswordUpdateError({ code: "same_password" }),
  STAFF_PASSWORD_COPY.sameAsCurrent,
);
assert.equal(
  mapPasswordUpdateError({ code: "reauthentication_needed" }),
  STAFF_PASSWORD_COPY.reauth,
);
assert.doesNotMatch(
  mapPasswordUpdateError({ message: "old-secret-value" }),
  /old-secret-value/,
);

const profileActions = readFileSync(
  resolve("src/foundation/staff/profile-actions.ts"),
  "utf8",
);
assert.match(profileActions, /export async function updateStaffEmailAction/);
assert.match(profileActions, /email_confirm:\s*true/);
assert.match(profileActions, /export async function updateStaffUsernameAction/);
assert.match(profileActions, /export async function updateStaffDisplayNameAction/);
assert.match(profileActions, /export async function updateStaffPasswordAction/);
assert.match(profileActions, /await requireStaff\(\)/);
assert.match(
  profileActions,
  /updateStaffUsernameAction[\s\S]*\.eq\("id", staff\.id\)/,
);
assert.match(
  profileActions,
  /updateStaffUsernameAction[\s\S]*\.eq\("auth_user_id", staff\.authUserId\)/,
);
assert.match(
  profileActions,
  /updateStaffUsernameAction[\s\S]*update\(\{\s*username,/,
);
assert.doesNotMatch(
  profileActions,
  /updateStaffUsernameAction[\s\S]*updateUserById/,
);
assert.doesNotMatch(
  profileActions,
  /updateStaffUsernameAction[\s\S]*signOut/,
);
assert.match(
  profileActions,
  /staffUsernamesMatch\(username, staff\.username\)/,
);
assert.match(profileActions, /STAFF_USERNAME_COPY\.taken/);
assert.match(profileActions, /current_password:\s*currentPassword/);
assert.match(profileActions, /auth\.updateUser/);
assert.doesNotMatch(
  profileActions,
  /updateStaffPasswordAction[\s\S]*createServiceClient/,
);
assert.doesNotMatch(
  profileActions,
  /updateStaffPasswordAction[\s\S]*signOut/,
);
assert.doesNotMatch(
  profileActions,
  /updateStaffPasswordAction[\s\S]*redirect\("\/login"\)/,
);
assert.match(
  profileActions,
  /updateStaffDisplayNameAction[\s\S]*requireStaff\(\)/,
);
assert.match(
  profileActions,
  /updateStaffDisplayNameAction[\s\S]*formData\.get\("displayName"\)/,
);
assert.match(
  profileActions,
  /updateStaffDisplayNameAction[\s\S]*\.trim\(\)/,
);
assert.match(
  profileActions,
  /updateStaffDisplayNameAction[\s\S]*Please enter a display name/,
);
assert.match(
  profileActions,
  /updateStaffDisplayNameAction[\s\S]*update\(\{\s*display_name:/,
);
assert.match(
  profileActions,
  /updateStaffDisplayNameAction[\s\S]*\.eq\("id", staff\.id\)/,
);
assert.match(
  profileActions,
  /updateStaffDisplayNameAction[\s\S]*\.eq\("auth_user_id", staff\.authUserId\)/,
);
assert.match(
  profileActions,
  /updateStaffDisplayNameAction[\s\S]*revalidatePath\("\/settings"\)/,
);
assert.doesNotMatch(
  profileActions,
  /updateStaffDisplayNameAction[\s\S]*updateUserById/,
);
assert.doesNotMatch(
  profileActions,
  /updateStaffDisplayNameAction[\s\S]*user_metadata/,
);
assert.doesNotMatch(
  profileActions,
  /updateStaffDisplayNameAction[\s\S]*username,/,
);
assert.doesNotMatch(
  profileActions,
  /updateStaffDisplayNameAction[\s\S]*\n\s*email,/,
);
assert.doesNotMatch(
  profileActions,
  /updateStaffDisplayNameAction[\s\S]*role_id/,
);
assert.doesNotMatch(
  profileActions,
  /updateStaffDisplayNameAction[\s\S]*auth_user_id:/,
);
assert.doesNotMatch(profileActions, /formData\.get\("staffId"\)/);
assert.doesNotMatch(profileActions, /formData\.get\("staff_id"\)/);
assert.doesNotMatch(profileActions, /console\.(log|info|debug|warn|error)/);

const usernameForm = readFileSync(
  resolve("src/components/settings/StaffUsernameForm.tsx"),
  "utf8",
);
assert.match(usernameForm, /initialUsername/);
assert.match(usernameForm, /Save username/);
assert.match(usernameForm, /STAFF_USERNAME_COPY\.helper/);
assert.match(usernameForm, /STAFF_USERNAME_COPY\.success/);
assert.match(usernameForm, /STAFF_USERNAME_COPY\.unchanged/);
assert.match(usernameForm, /disabled=\{saving \|\| !usernameChanged\}/);
assert.doesNotMatch(usernameForm, /staffId|staff_id|authUserId/);

const passwordForm = readFileSync(
  resolve("src/components/settings/StaffPasswordSettings.tsx"),
  "utf8",
);
assert.match(passwordForm, /Change your Whitebird login password/);
assert.match(passwordForm, /Current password/);
assert.match(passwordForm, /New password/);
assert.match(passwordForm, /Confirm new password/);
assert.match(passwordForm, /Change password/);
assert.match(passwordForm, /validatePasswordChangeInput/);
assert.match(passwordForm, /clearPasswordFields/);
assert.match(passwordForm, /setCurrentPassword\(""\)/);
assert.match(passwordForm, /setNewPassword\(""\)/);
assert.match(passwordForm, /setConfirmPassword\(""\)/);
assert.match(passwordForm, /STAFF_PASSWORD_COPY\.success/);
assert.match(passwordForm, /signed in with a Passkey/);
assert.doesNotMatch(passwordForm, /console\.(log|info|debug|warn|error)/);
assert.doesNotMatch(passwordForm, /localStorage/);

const settingsPage = readFileSync(
  resolve("src/app/(app)/settings/page.tsx"),
  "utf8",
);
assert.match(settingsPage, /requireStaff/);
assert.match(
  settingsPage,
  /StaffDisplayNameForm initialDisplayName=\{staff\.displayName\}/,
);
assert.match(
  settingsPage,
  /StaffUsernameForm initialUsername=\{staff\.username\}/,
);

const displayNameForm = readFileSync(
  resolve("src/components/settings/StaffDisplayNameForm.tsx"),
  "utf8",
);
assert.match(displayNameForm, /updateStaffDisplayNameAction/);
assert.match(displayNameForm, /initialDisplayName/);
assert.match(displayNameForm, /Save display name/);
assert.match(displayNameForm, /router\.refresh\(\)/);
assert.doesNotMatch(displayNameForm, /staffId|staff_id|authUserId/);
assert.doesNotMatch(displayNameForm, /updateStaffUsernameAction|updateStaffEmailAction|updateStaffPasswordAction/);
assert.match(settingsPage, /StaffProfileForm initialEmail=\{staff\.email/);
assert.match(settingsPage, /StaffPasskeySettings/);
assert.match(settingsPage, /StaffPasswordSettings/);
assert.match(
  settingsPage,
  /StaffPasskeySettings \/>\s*<StaffPasswordSettings \/>/,
);

const emailForm = readFileSync(
  resolve("src/components/settings/StaffProfileForm.tsx"),
  "utf8",
);
assert.match(emailForm, /updateStaffEmailAction/);
assert.match(emailForm, /Save email/);

const passkeySettings = readFileSync(
  resolve("src/components/settings/StaffPasskeySettings.tsx"),
  "utf8",
);
assert.match(passkeySettings, /registerPasskey/);
assert.match(passkeySettings, /passkey\.list/);
assert.match(passkeySettings, /passkey\.delete/);

const loginForm = readFileSync(resolve("src/components/LoginForm.tsx"), "utf8");
assert.match(loginForm, /loginAction/);
assert.match(loginForm, /signInWithPasskey/);
assert.match(loginForm, /completePasskeyLoginAction/);

const authActions = readFileSync(
  resolve("src/foundation/auth/actions.ts"),
  "utf8",
);
assert.match(authActions, /signInWithPassword/);
assert.match(authActions, /completePasskeyLoginAction/);
assert.doesNotMatch(authActions, /updateStaffUsernameAction/);
assert.doesNotMatch(authActions, /updateStaffPasswordAction/);

const sessionSource = readFileSync(
  resolve("src/foundation/auth/session.ts"),
  "utf8",
);
assert.match(sessionSource, /export async function requireStaff/);
assert.match(sessionSource, /getStaffByAuthUserId/);

const schema = readFileSync(
  resolve("supabase/migrations/20260802120000_staff_profiles_and_roles.sql"),
  "utf8",
);
assert.match(schema, /username citext not null unique/);
assert.match(schema, /staff_profiles_username_format/);

const browse = readFileSync(
  resolve("src/workspaces/storefront/catalog/BrowseCakeCatalogue.tsx"),
  "utf8",
);
assert.doesNotMatch(browse, /updateStaffUsernameAction|Change password/);

console.log("test-staff-credentials: PASS");
