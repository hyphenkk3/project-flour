/**
 * Owner-only staff administration.
 * Run: npx tsx scripts/test-staff-admin.ts
 *
 * Live Auth create/login and last-owner races are not executed here.
 * Guards and action wiring are asserted; physical DEV testing covers the
 * Auth round-trip.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { canManageStaff } from "@/foundation/navigation/access";
import {
  STAFF_ADMIN_COPY,
  isStaffRoleCode,
  staffAdminActorError,
  staffAdminDeactivateError,
  staffAdminRoleChangeError,
  staffAdminUsernameChangeError,
} from "@/foundation/staff/admin-guards";

assert.equal(canManageStaff("owner"), true);
assert.equal(canManageStaff("manager"), false);
assert.equal(canManageStaff("customer_operations"), false);
assert.equal(canManageStaff("bakery"), false);
assert.equal(canManageStaff("collection"), false);
assert.equal(staffAdminActorError("owner"), null);
assert.equal(staffAdminActorError("bakery"), STAFF_ADMIN_COPY.unauthorized);
assert.equal(isStaffRoleCode("bakery"), true);
assert.equal(isStaffRoleCode("admin"), false);

assert.equal(
  staffAdminDeactivateError({
    actorStaffId: "owner-1",
    targetStaffId: "owner-1",
    targetIsActiveOwner: true,
    activeOwnerCount: 3,
  }),
  STAFF_ADMIN_COPY.cannotDeactivateSelf,
);
assert.equal(
  staffAdminDeactivateError({
    actorStaffId: "owner-1",
    targetStaffId: "owner-2",
    targetIsActiveOwner: true,
    activeOwnerCount: 1,
  }),
  STAFF_ADMIN_COPY.lastOwner,
);
assert.equal(
  staffAdminDeactivateError({
    actorStaffId: "owner-1",
    targetStaffId: "bakery-1",
    targetIsActiveOwner: false,
    activeOwnerCount: 1,
  }),
  null,
);

assert.equal(
  staffAdminRoleChangeError({
    actorStaffId: "owner-1",
    targetStaffId: "owner-1",
    targetIsActiveOwner: true,
    nextRoleIsOwner: false,
    activeOwnerCount: 3,
  }),
  STAFF_ADMIN_COPY.cannotDemoteSelf,
);
assert.equal(
  staffAdminRoleChangeError({
    actorStaffId: "owner-1",
    targetStaffId: "owner-2",
    targetIsActiveOwner: true,
    nextRoleIsOwner: false,
    activeOwnerCount: 1,
  }),
  STAFF_ADMIN_COPY.lastOwner,
);
assert.equal(
  staffAdminRoleChangeError({
    actorStaffId: "owner-1",
    targetStaffId: "bakery-1",
    targetIsActiveOwner: false,
    nextRoleIsOwner: false,
    activeOwnerCount: 1,
  }),
  null,
);
assert.equal(
  staffAdminUsernameChangeError({
    actorStaffId: "owner-1",
    targetStaffId: "owner-1",
  }),
  STAFF_ADMIN_COPY.cannotEditOwnUsername,
);
assert.equal(
  staffAdminUsernameChangeError({
    actorStaffId: "owner-1",
    targetStaffId: "bakery-1",
  }),
  null,
);

assert.equal(
  staffAdminRoleChangeError({
    actorStaffId: "owner-1",
    targetStaffId: "owner-2",
    targetIsActiveOwner: true,
    nextRoleIsOwner: false,
    activeOwnerCount: 2,
  }),
  null,
);
assert.equal(
  staffAdminDeactivateError({
    actorStaffId: "owner-1",
    targetStaffId: "owner-2",
    targetIsActiveOwner: true,
    activeOwnerCount: 2,
  }),
  null,
);

const adminActions = readFileSync(
  resolve("src/foundation/staff/admin-actions.ts"),
  "utf8",
);
assert.match(adminActions, /requireStaff\(\)/);
assert.match(adminActions, /canManageStaff/);
assert.match(adminActions, /staffAdminActorError/);
assert.match(adminActions, /STAFF_ADMIN_COPY\.unauthorized/);
assert.match(adminActions, /validateStaffUsername/);
assert.match(adminActions, /findStaffByUsername/);
assert.match(adminActions, /countActiveOwners/);
assert.match(adminActions, /auth\.admin\.createUser/);
assert.match(adminActions, /email_confirm:\s*true/);
assert.match(adminActions, /auth\.admin\.deleteUser/);
assert.match(adminActions, /from\("staff_profiles"\)\.insert/);
assert.match(adminActions, /updateManagedStaffUsernameAction/);
assert.match(adminActions, /updateManagedStaffRoleAction/);
assert.match(adminActions, /setManagedStaffActiveAction/);
assert.match(adminActions, /staffAdminDeactivateError/);
assert.match(adminActions, /staffAdminRoleChangeError/);
assert.match(adminActions, /\.update\(\{\s*username,/);
assert.match(adminActions, /\.update\(\{\s*role_id:/);
assert.match(adminActions, /\.update\(\{\s*is_active:/);
assert.doesNotMatch(adminActions, /formData\.get\("actor/);
assert.doesNotMatch(adminActions, /formData\.get\("actorId"\)/);
assert.doesNotMatch(adminActions, /updateUserById/);
assert.doesNotMatch(adminActions, /updateUser\(\{\s*password/);
assert.doesNotMatch(adminActions, /current_password/);
assert.doesNotMatch(adminActions, /ban/);
assert.doesNotMatch(adminActions, /registerPasskey|signInWithPasskey|passkey\./);
assert.doesNotMatch(adminActions, /console\.(log|info|debug|warn|error)/);
assert.doesNotMatch(adminActions, /from "next\/navigation"/);
assert.doesNotMatch(adminActions, /\.update\(\{[^}]*email/);
assert.match(
  adminActions,
  /createUser[\s\S]*staff_profiles[\s\S]*deleteUser/,
);
assert.match(
  adminActions,
  /export async function createStaffAccountAction[\s\S]*requireStaffAdmin\(\)/,
);
assert.match(
  adminActions,
  /export async function updateManagedStaffUsernameAction[\s\S]*requireStaffAdmin\(\)/,
);
assert.match(
  adminActions,
  /export async function updateManagedStaffRoleAction[\s\S]*requireStaffAdmin\(\)/,
);
assert.match(
  adminActions,
  /export async function setManagedStaffActiveAction[\s\S]*requireStaffAdmin\(\)/,
);

const queries = readFileSync(resolve("src/foundation/staff/queries.ts"), "utf8");
assert.match(queries, /export async function listStaffProfilesForAdmin/);
assert.match(queries, /export async function listStaffRoles/);
assert.match(queries, /export async function countActiveOwners/);
assert.match(queries, /createServiceClient/);

const settingsPage = readFileSync(
  resolve("src/app/(app)/settings/page.tsx"),
  "utf8",
);
assert.match(settingsPage, /canManageStaff/);
assert.match(settingsPage, /href="\/settings\/staff"/);
assert.match(settingsPage, /StaffPasskeySettings/);
assert.match(settingsPage, /StaffPasswordSettings/);
assert.match(settingsPage, /StaffUsernameForm/);
assert.match(settingsPage, /updateStaffEmailAction|StaffProfileForm/);

const staffPage = readFileSync(
  resolve("src/app/(app)/settings/staff/page.tsx"),
  "utf8",
);
assert.match(staffPage, /requireStaff/);
assert.match(staffPage, /canManageStaff/);
assert.match(staffPage, /redirect\("\/settings"\)/);
assert.match(staffPage, /listStaffProfilesForAdmin/);
assert.doesNotMatch(staffPage, /password reset|Passkey/);

const createForm = readFileSync(
  resolve("src/components/settings/StaffAdminCreateForm.tsx"),
  "utf8",
);
assert.match(createForm, /createStaffAccountAction/);
assert.match(createForm, /name="password"/);
assert.match(createForm, /name="confirmPassword"/);
assert.doesNotMatch(createForm, /localStorage/);

const directory = readFileSync(
  resolve("src/components/settings/StaffAdminDirectory.tsx"),
  "utf8",
);
assert.match(directory, /updateManagedStaffUsernameAction/);
assert.match(directory, /updateManagedStaffRoleAction/);
assert.match(directory, /setManagedStaffActiveAction/);
assert.match(directory, /Confirm deactivate/);
assert.match(directory, /member\.role\.name/);
assert.doesNotMatch(directory, /type="email".*admin|Change email|Reset password/);

const profileActions = readFileSync(
  resolve("src/foundation/staff/profile-actions.ts"),
  "utf8",
);
assert.match(profileActions, /updateStaffEmailAction/);
assert.match(profileActions, /updateStaffUsernameAction/);
assert.match(profileActions, /updateStaffPasswordAction/);
assert.doesNotMatch(profileActions, /createStaffAccountAction/);
assert.doesNotMatch(profileActions, /listStaffProfilesForAdmin/);
assert.doesNotMatch(profileActions, /admin-actions/);

const passkeySettings = readFileSync(
  resolve("src/components/settings/StaffPasskeySettings.tsx"),
  "utf8",
);
assert.match(passkeySettings, /registerPasskey/);
assert.match(passkeySettings, /passkey\.list/);
assert.match(passkeySettings, /passkey\.delete/);
assert.doesNotMatch(passkeySettings, /admin-actions/);

const passkeys = readFileSync(resolve("src/foundation/auth/passkeys.ts"), "utf8");
assert.doesNotMatch(passkeys, /admin-actions|listStaffProfilesForAdmin/);

const loginForm = readFileSync(resolve("src/components/LoginForm.tsx"), "utf8");
assert.match(loginForm, /signInWithPasskey/);
assert.match(loginForm, /loginAction/);
assert.doesNotMatch(loginForm, /admin-actions/);

const session = readFileSync(
  resolve("src/foundation/auth/session.ts"),
  "utf8",
);
assert.match(session, /!staff \|\| !staff\.isActive/);
assert.match(session, /signOut/);

const workspaces = readFileSync(
  resolve("src/foundation/navigation/workspaces.ts"),
  "utf8",
);
assert.match(workspaces, /management:[\s\S]*available: false/);

console.log("test-staff-admin: PASS");
