/**
 * Staff administration permission model.
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
  canManageOwnerStaff,
  isStaffRoleCode,
  staffAdminActivateError,
  staffAdminActorError,
  staffAdminCreateRoleError,
  staffAdminDeactivateError,
  staffAdminOwnerMutationError,
  staffAdminPasswordResetError,
  staffAdminRoleChangeError,
  staffAdminTransferError,
  staffAdminUsernameChangeError,
} from "@/foundation/staff/admin-guards";
import type { RoleCode } from "@/types/staff";

assert.equal(canManageStaff("owner"), true);
assert.equal(canManageStaff("manager"), true);
assert.equal(canManageStaff("customer_operations"), false);
assert.equal(canManageStaff("bakery"), false);
assert.equal(canManageStaff("collection"), false);
assert.equal(canManageOwnerStaff("owner"), true);
assert.equal(canManageOwnerStaff("manager"), false);
assert.equal(canManageOwnerStaff("bakery"), false);
assert.equal(staffAdminActorError("owner"), null);
assert.equal(staffAdminActorError("manager"), null);
assert.equal(staffAdminActorError("bakery"), STAFF_ADMIN_COPY.unauthorized);
assert.equal(isStaffRoleCode("bakery"), true);
assert.equal(isStaffRoleCode("admin"), false);

assert.equal(
  staffAdminDeactivateError({
    actorStaffId: "owner-1",
    targetStaffId: "owner-1",
    targetIsActiveOwner: true,
    activeOwnerCount: 3,
    actorRole: "owner",
    targetRoleIsOwner: true,
  }),
  STAFF_ADMIN_COPY.cannotDeactivateSelf,
);
assert.equal(
  staffAdminDeactivateError({
    actorStaffId: "owner-1",
    targetStaffId: "owner-2",
    targetIsActiveOwner: true,
    activeOwnerCount: 1,
    actorRole: "owner",
    targetRoleIsOwner: true,
  }),
  STAFF_ADMIN_COPY.lastOwner,
);
assert.equal(
  staffAdminDeactivateError({
    actorStaffId: "owner-1",
    targetStaffId: "owner-2",
    targetIsActiveOwner: true,
    activeOwnerCount: 1,
    actorRole: "owner",
    targetRoleIsOwner: true,
  }),
  STAFF_ADMIN_COPY.lastOwner,
);
assert.equal(
  staffAdminRoleChangeError({
    actorStaffId: "owner-1",
    targetStaffId: "owner-2",
    targetIsActiveOwner: true,
    nextRoleIsOwner: false,
    activeOwnerCount: 1,
    actorRole: "owner",
    targetRoleIsOwner: true,
  }),
  STAFF_ADMIN_COPY.lastOwner,
);
assert.equal(
  staffAdminDeactivateError({
    actorStaffId: "owner-1",
    targetStaffId: "bakery-1",
    targetIsActiveOwner: false,
    activeOwnerCount: 1,
    actorRole: "owner",
    targetRoleIsOwner: false,
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
    actorRole: "owner",
    targetRoleIsOwner: true,
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
    actorRole: "owner",
    targetRoleIsOwner: true,
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
    actorRole: "owner",
    targetRoleIsOwner: false,
  }),
  null,
);
assert.equal(
  staffAdminUsernameChangeError({
    actorStaffId: "owner-1",
    targetStaffId: "owner-1",
    actorRole: "owner",
    targetRoleIsOwner: true,
  }),
  STAFF_ADMIN_COPY.cannotEditOwnUsername,
);
assert.equal(
  staffAdminUsernameChangeError({
    actorStaffId: "owner-1",
    targetStaffId: "bakery-1",
    actorRole: "owner",
    targetRoleIsOwner: false,
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
    actorRole: "owner",
    targetRoleIsOwner: true,
  }),
  null,
);
assert.equal(
  staffAdminDeactivateError({
    actorStaffId: "owner-1",
    targetStaffId: "owner-2",
    targetIsActiveOwner: true,
    activeOwnerCount: 2,
    actorRole: "owner",
    targetRoleIsOwner: true,
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
assert.match(adminActions, /actorRole:\s*actor\.role\.code/);
assert.equal(
  adminActions.match(/actorRole:\s*actor\.role\.code/g)?.length,
  6,
);
assert.match(adminActions, /staffAdminActivateError/);
assert.match(adminActions, /auth\.admin\.createUser/);
assert.match(adminActions, /email_confirm:\s*true/);
assert.match(adminActions, /auth\.admin\.deleteUser/);
assert.match(adminActions, /from\("staff_profiles"\)\.insert/);
assert.match(adminActions, /is_master_owner:\s*false/);
assert.match(adminActions, /staffAdminCreateRoleError/);
assert.match(adminActions, /updateManagedStaffUsernameAction/);
assert.match(adminActions, /updateManagedStaffRoleAction/);
assert.match(adminActions, /setManagedStaffActiveAction/);
assert.match(adminActions, /archiveManagedStaffAction/);
assert.match(adminActions, /restoreManagedStaffAction/);
assert.match(adminActions, /transferMasterOwnerAction/);
assert.match(adminActions, /transfer_master_owner/);
assert.match(adminActions, /p_actor_staff_id:\s*actor\.id/);
assert.match(adminActions, /staffAdminDeactivateError/);
assert.match(adminActions, /staffAdminArchiveError/);
assert.match(adminActions, /staffAdminRestoreError/);
assert.match(adminActions, /staffAdminRoleChangeError/);
assert.match(adminActions, /staffAdminTransferError/);
assert.doesNotMatch(adminActions, /formData\.get\("isMasterOwner"\)/);
assert.doesNotMatch(adminActions, /\.update\(\{[^}]*is_master_owner/);
assert.doesNotMatch(adminActions, /export async function setMaster/);
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
assert.match(
  adminActions,
  /export async function archiveManagedStaffAction[\s\S]*requireStaffAdmin\(\)/,
);
assert.match(
  adminActions,
  /export async function restoreManagedStaffAction[\s\S]*requireStaffAdmin\(\)/,
);
assert.match(
  adminActions,
  /export async function transferMasterOwnerAction[\s\S]*requireStaffAdmin\(\)/,
);
assert.match(
  adminActions,
  /export async function transferMasterOwnerAction[\s\S]*p_actor_staff_id:\s*actor\.id/,
);

const queries = readFileSync(resolve("src/foundation/staff/queries.ts"), "utf8");
assert.match(queries, /export async function listStaffProfilesForAdmin/);
assert.match(queries, /export async function listStaffRoles/);
assert.match(queries, /export async function countActiveOwners/);
assert.match(queries, /createServiceClient/);
assert.match(queries, /isMasterOwner: Boolean\(row\.is_master_owner\)/);
assert.match(queries, /mustChangePassword: Boolean\(row\.must_change_password\)/);
assert.match(queries, /is_master_owner,/);
assert.match(queries, /must_change_password,/);
assert.match(queries, /archived_at,/);
assert.match(queries, /archivedAt: row\.archived_at \?\? null/);
assert.match(queries, /export async function listArchivedStaffProfilesForAdmin/);
assert.match(queries, /\.is\("archived_at", null\)/);
assert.match(queries, /\.not\("archived_at", "is", null\)/);

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
assert.match(staffPage, /listArchivedStaffProfilesForAdmin/);
assert.match(staffPage, /archivedStaff=\{archivedStaff\}/);
assert.match(staffPage, /actorIsMasterOwner=\{actor\.isMasterOwner\}/);
assert.match(staffPage, /actorRole=\{actor\.role\.code\}/);
assert.doesNotMatch(staffPage, /password reset|Passkey/);

const createForm = readFileSync(
  resolve("src/components/settings/StaffAdminCreateForm.tsx"),
  "utf8",
);
assert.match(createForm, /createStaffAccountAction/);
assert.match(createForm, /actorIsMasterOwner/);
assert.match(createForm, /role\.code !== "owner"/);
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
assert.match(directory, /transferMasterOwnerAction/);
assert.match(directory, /Confirm deactivate/);
assert.match(directory, /Transfer Master Owner/);
assert.match(directory, /Confirm transfer/);
assert.match(directory, /Master Owner/);
assert.match(directory, /member\.role\.name/);
assert.match(directory, /member\.isMasterOwner/);
assert.match(directory, /actorRole/);
assert.match(directory, /ownerLocked/);
assert.match(directory, /canManageOwnerStaff/);
assert.match(directory, /resetManagedStaffPasswordAction/);
assert.match(directory, /archiveManagedStaffAction/);
assert.match(directory, /restoreManagedStaffAction/);
assert.match(directory, /Reset password/);
assert.match(directory, /canResetPassword/);
assert.match(directory, /canArchive/);
assert.match(directory, /Archived Staff/);
assert.match(directory, /Confirm archive/);
assert.match(directory, /Confirm restore/);
assert.match(directory, /temporaryPassword/);
assert.doesNotMatch(directory, /localStorage|sessionStorage/);
assert.doesNotMatch(directory, /createServiceClient|SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(directory, /type="email".*admin|Change email/);

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

const types = readFileSync(resolve("src/types/staff.ts"), "utf8");
assert.match(types, /isMasterOwner: boolean/);
assert.match(types, /mustChangePassword: boolean/);
assert.match(types, /archivedAt: string \| null/);
assert.doesNotMatch(types, /role.*=.*"master/);

assert.equal(
  staffAdminCreateRoleError({
    actorIsMasterOwner: false,
    roleCode: "owner",
  }),
  STAFF_ADMIN_COPY.cannotCreateOwner,
);
assert.equal(
  staffAdminCreateRoleError({
    actorIsMasterOwner: false,
    roleCode: "bakery",
  }),
  null,
);
assert.equal(
  staffAdminCreateRoleError({
    actorIsMasterOwner: true,
    roleCode: "owner",
  }),
  null,
);

assert.equal(
  staffAdminRoleChangeError({
    actorStaffId: "owner-1",
    targetStaffId: "bakery-1",
    targetIsActiveOwner: false,
    nextRoleIsOwner: true,
    activeOwnerCount: 2,
    actorIsMasterOwner: false,
    actorRole: "owner",
    targetRoleIsOwner: false,
  }),
  STAFF_ADMIN_COPY.cannotPromoteToOwner,
);
assert.equal(
  staffAdminRoleChangeError({
    actorStaffId: "master-1",
    targetStaffId: "bakery-1",
    targetIsActiveOwner: false,
    nextRoleIsOwner: true,
    activeOwnerCount: 2,
    actorIsMasterOwner: true,
    actorRole: "owner",
    targetRoleIsOwner: false,
  }),
  null,
);
assert.equal(
  staffAdminRoleChangeError({
    actorStaffId: "owner-1",
    targetStaffId: "master-1",
    targetIsActiveOwner: true,
    nextRoleIsOwner: false,
    activeOwnerCount: 2,
    actorIsMasterOwner: false,
    actorRole: "owner",
    targetIsMasterOwner: true,
    targetRoleIsOwner: true,
  }),
  STAFF_ADMIN_COPY.cannotDemoteMaster,
);
assert.equal(
  staffAdminRoleChangeError({
    actorStaffId: "master-1",
    targetStaffId: "master-1",
    targetIsActiveOwner: true,
    nextRoleIsOwner: false,
    activeOwnerCount: 2,
    actorIsMasterOwner: true,
    actorRole: "owner",
    targetIsMasterOwner: true,
    targetRoleIsOwner: true,
  }),
  STAFF_ADMIN_COPY.cannotDemoteSelf,
);
assert.equal(
  staffAdminRoleChangeError({
    actorStaffId: "master-1",
    targetStaffId: "owner-2",
    targetIsActiveOwner: true,
    nextRoleIsOwner: false,
    activeOwnerCount: 2,
    actorIsMasterOwner: true,
    actorRole: "owner",
    targetIsMasterOwner: false,
    targetRoleIsOwner: true,
  }),
  null,
);

assert.equal(
  staffAdminDeactivateError({
    actorStaffId: "owner-1",
    targetStaffId: "master-1",
    targetIsActiveOwner: true,
    activeOwnerCount: 2,
    actorRole: "owner",
    targetIsMasterOwner: true,
    targetRoleIsOwner: true,
  }),
  STAFF_ADMIN_COPY.cannotDeactivateMaster,
);
assert.equal(
  staffAdminDeactivateError({
    actorStaffId: "master-1",
    targetStaffId: "master-1",
    targetIsActiveOwner: true,
    activeOwnerCount: 2,
    actorRole: "owner",
    targetIsMasterOwner: true,
    targetRoleIsOwner: true,
  }),
  STAFF_ADMIN_COPY.cannotDeactivateSelf,
);
assert.equal(
  staffAdminDeactivateError({
    actorStaffId: "master-1",
    targetStaffId: "owner-2",
    targetIsActiveOwner: true,
    activeOwnerCount: 2,
    actorRole: "owner",
    targetIsMasterOwner: false,
    targetRoleIsOwner: true,
  }),
  null,
);

assert.equal(
  staffAdminUsernameChangeError({
    actorStaffId: "owner-1",
    targetStaffId: "master-1",
    actorRole: "owner",
    targetIsMasterOwner: true,
    targetRoleIsOwner: true,
  }),
  STAFF_ADMIN_COPY.cannotChangeMaster,
);
assert.equal(
  staffAdminUsernameChangeError({
    actorStaffId: "master-1",
    targetStaffId: "bakery-1",
    actorRole: "owner",
    targetIsMasterOwner: false,
    targetRoleIsOwner: false,
  }),
  null,
);

assert.equal(
  staffAdminTransferError({
    actorStaffId: "owner-1",
    targetStaffId: "owner-2",
    actorIsMasterOwner: false,
    targetIsActive: true,
    targetIsOwner: true,
  }),
  STAFF_ADMIN_COPY.cannotTransfer,
);
assert.equal(
  staffAdminTransferError({
    actorStaffId: "master-1",
    targetStaffId: "master-1",
    actorIsMasterOwner: true,
    targetIsActive: true,
    targetIsOwner: true,
  }),
  STAFF_ADMIN_COPY.cannotTransferToSelf,
);
assert.equal(
  staffAdminTransferError({
    actorStaffId: "master-1",
    targetStaffId: "bakery-1",
    actorIsMasterOwner: true,
    targetIsActive: true,
    targetIsOwner: false,
  }),
  STAFF_ADMIN_COPY.transferTargetMustBeActiveOwner,
);
assert.equal(
  staffAdminTransferError({
    actorStaffId: "master-1",
    targetStaffId: "owner-2",
    actorIsMasterOwner: true,
    targetIsActive: false,
    targetIsOwner: true,
  }),
  STAFF_ADMIN_COPY.transferTargetMustBeActiveOwner,
);
assert.equal(
  staffAdminTransferError({
    actorStaffId: "master-1",
    targetStaffId: "owner-2",
    actorIsMasterOwner: true,
    targetIsActive: true,
    targetIsOwner: true,
  }),
  null,
);

assert.equal(
  staffAdminUsernameChangeError({
    actorStaffId: "master-1",
    targetStaffId: "bakery-1",
    actorRole: "owner",
    targetIsMasterOwner: false,
    targetRoleIsOwner: false,
  }),
  null,
);
assert.equal(
  staffAdminRoleChangeError({
    actorStaffId: "master-1",
    targetStaffId: "bakery-1",
    targetIsActiveOwner: false,
    nextRoleIsOwner: false,
    activeOwnerCount: 2,
    actorIsMasterOwner: true,
    actorRole: "owner",
    targetRoleIsOwner: false,
  }),
  null,
);
assert.equal(
  staffAdminUsernameChangeError({
    actorStaffId: "master-1",
    targetStaffId: "owner-2",
    actorRole: "owner",
    targetIsMasterOwner: false,
    targetRoleIsOwner: true,
  }),
  null,
);
assert.equal(
  staffAdminRoleChangeError({
    actorStaffId: "owner-1",
    targetStaffId: "bakery-1",
    targetIsActiveOwner: false,
    nextRoleIsOwner: false,
    activeOwnerCount: 2,
    actorIsMasterOwner: false,
    actorRole: "owner",
    targetRoleIsOwner: false,
  }),
  null,
);
assert.equal(
  staffAdminUsernameChangeError({
    actorStaffId: "owner-1",
    targetStaffId: "owner-2",
    actorRole: "owner",
    targetIsMasterOwner: false,
    targetRoleIsOwner: true,
  }),
  null,
);

assert.equal(
  staffAdminCreateRoleError({
    actorIsMasterOwner: false,
    roleCode: "manager",
  }),
  null,
);
assert.equal(
  staffAdminCreateRoleError({
    actorIsMasterOwner: false,
    roleCode: "owner",
  }),
  STAFF_ADMIN_COPY.cannotCreateOwner,
);
assert.equal(
  staffAdminUsernameChangeError({
    actorStaffId: "manager-1",
    targetStaffId: "bakery-1",
    actorRole: "manager",
    targetRoleIsOwner: false,
  }),
  null,
);
assert.equal(
  staffAdminRoleChangeError({
    actorStaffId: "manager-1",
    targetStaffId: "bakery-1",
    targetIsActiveOwner: false,
    nextRoleIsOwner: false,
    activeOwnerCount: 2,
    actorIsMasterOwner: false,
    actorRole: "manager",
    targetRoleIsOwner: false,
  }),
  null,
);
assert.equal(
  staffAdminDeactivateError({
    actorStaffId: "manager-1",
    targetStaffId: "bakery-1",
    targetIsActiveOwner: false,
    activeOwnerCount: 2,
    actorRole: "manager",
    targetRoleIsOwner: false,
  }),
  null,
);
assert.equal(
  staffAdminUsernameChangeError({
    actorStaffId: "manager-1",
    targetStaffId: "owner-2",
    actorRole: "manager",
    targetIsMasterOwner: false,
    targetRoleIsOwner: true,
  }),
  STAFF_ADMIN_COPY.cannotManageOwner,
);
assert.equal(
  staffAdminRoleChangeError({
    actorStaffId: "manager-1",
    targetStaffId: "owner-2",
    targetIsActiveOwner: true,
    nextRoleIsOwner: false,
    activeOwnerCount: 2,
    actorIsMasterOwner: false,
    actorRole: "manager",
    targetIsMasterOwner: false,
    targetRoleIsOwner: true,
  }),
  STAFF_ADMIN_COPY.cannotManageOwner,
);
assert.equal(
  staffAdminRoleChangeError({
    actorStaffId: "manager-1",
    targetStaffId: "bakery-1",
    targetIsActiveOwner: false,
    nextRoleIsOwner: true,
    activeOwnerCount: 2,
    actorIsMasterOwner: false,
    actorRole: "manager",
    targetRoleIsOwner: false,
  }),
  STAFF_ADMIN_COPY.cannotPromoteToOwner,
);
assert.equal(
  staffAdminDeactivateError({
    actorStaffId: "manager-1",
    targetStaffId: "owner-2",
    targetIsActiveOwner: true,
    activeOwnerCount: 2,
    actorRole: "manager",
    targetIsMasterOwner: false,
    targetRoleIsOwner: true,
  }),
  STAFF_ADMIN_COPY.cannotManageOwner,
);
assert.equal(
  staffAdminActivateError({
    actorRole: "manager",
    targetRoleIsOwner: true,
    targetIsMasterOwner: false,
  }),
  STAFF_ADMIN_COPY.cannotManageOwner,
);
assert.equal(
  staffAdminActivateError({
    actorRole: "owner",
    targetRoleIsOwner: true,
    targetIsMasterOwner: false,
  }),
  null,
);
assert.equal(
  staffAdminUsernameChangeError({
    actorStaffId: "manager-1",
    targetStaffId: "master-1",
    actorRole: "manager",
    targetIsMasterOwner: true,
    targetRoleIsOwner: true,
  }),
  STAFF_ADMIN_COPY.cannotChangeMaster,
);
assert.equal(
  staffAdminRoleChangeError({
    actorStaffId: "manager-1",
    targetStaffId: "master-1",
    targetIsActiveOwner: true,
    nextRoleIsOwner: false,
    activeOwnerCount: 2,
    actorIsMasterOwner: false,
    actorRole: "manager",
    targetIsMasterOwner: true,
    targetRoleIsOwner: true,
  }),
  STAFF_ADMIN_COPY.cannotDemoteMaster,
);
assert.equal(
  staffAdminRoleChangeError({
    actorStaffId: "manager-1",
    targetStaffId: "master-1",
    targetIsActiveOwner: true,
    nextRoleIsOwner: true,
    activeOwnerCount: 2,
    actorIsMasterOwner: false,
    actorRole: "manager",
    targetIsMasterOwner: true,
    targetRoleIsOwner: true,
  }),
  STAFF_ADMIN_COPY.cannotChangeMaster,
);
assert.equal(
  staffAdminDeactivateError({
    actorStaffId: "manager-1",
    targetStaffId: "master-1",
    targetIsActiveOwner: true,
    activeOwnerCount: 2,
    actorRole: "manager",
    targetIsMasterOwner: true,
    targetRoleIsOwner: true,
  }),
  STAFF_ADMIN_COPY.cannotDeactivateMaster,
);
assert.equal(
  staffAdminActivateError({
    actorRole: "manager",
    targetRoleIsOwner: true,
    targetIsMasterOwner: true,
  }),
  STAFF_ADMIN_COPY.cannotChangeMaster,
);
assert.equal(
  staffAdminTransferError({
    actorStaffId: "manager-1",
    targetStaffId: "owner-2",
    actorIsMasterOwner: false,
    targetIsActive: true,
    targetIsOwner: true,
  }),
  STAFF_ADMIN_COPY.cannotTransfer,
);

const missingActorRole = undefined as unknown as RoleCode;
const invalidActorRole = "admin" as RoleCode;
assert.equal(
  staffAdminOwnerMutationError({
    actorRole: missingActorRole,
    targetRoleIsOwner: true,
  }),
  STAFF_ADMIN_COPY.cannotManageOwner,
);
assert.equal(
  staffAdminOwnerMutationError({
    actorRole: invalidActorRole,
    targetRoleIsOwner: true,
  }),
  STAFF_ADMIN_COPY.cannotManageOwner,
);
assert.equal(
  staffAdminOwnerMutationError({
    actorRole: "manager",
    targetRoleIsOwner: undefined as unknown as boolean,
  }),
  STAFF_ADMIN_COPY.cannotManageOwner,
);
assert.equal(
  staffAdminUsernameChangeError({
    actorStaffId: "unknown-1",
    targetStaffId: "owner-2",
    actorRole: missingActorRole,
    targetRoleIsOwner: true,
  }),
  STAFF_ADMIN_COPY.cannotManageOwner,
);
assert.equal(
  staffAdminRoleChangeError({
    actorStaffId: "unknown-1",
    targetStaffId: "owner-2",
    targetIsActiveOwner: true,
    nextRoleIsOwner: false,
    activeOwnerCount: 2,
    actorRole: missingActorRole,
    targetRoleIsOwner: true,
  }),
  STAFF_ADMIN_COPY.cannotManageOwner,
);
assert.equal(
  staffAdminDeactivateError({
    actorStaffId: "unknown-1",
    targetStaffId: "owner-2",
    targetIsActiveOwner: true,
    activeOwnerCount: 2,
    actorRole: missingActorRole,
    targetRoleIsOwner: true,
  }),
  STAFF_ADMIN_COPY.cannotManageOwner,
);
assert.equal(
  staffAdminActivateError({
    actorRole: missingActorRole,
    targetRoleIsOwner: true,
  }),
  STAFF_ADMIN_COPY.cannotManageOwner,
);
assert.equal(
  staffAdminUsernameChangeError({
    actorStaffId: "unknown-1",
    targetStaffId: "owner-2",
    actorRole: invalidActorRole,
    targetRoleIsOwner: true,
  }),
  STAFF_ADMIN_COPY.cannotManageOwner,
);

assert.equal(
  staffAdminPasswordResetError({
    actorStaffId: "master-1",
    targetStaffId: "bakery-1",
    actorRole: "owner",
    targetRoleIsOwner: false,
  }),
  null,
);
assert.equal(
  staffAdminPasswordResetError({
    actorStaffId: "master-1",
    targetStaffId: "owner-2",
    actorRole: "owner",
    targetIsMasterOwner: false,
    targetRoleIsOwner: true,
  }),
  null,
);
assert.equal(
  staffAdminPasswordResetError({
    actorStaffId: "master-1",
    targetStaffId: "master-1",
    actorRole: "owner",
    targetIsMasterOwner: true,
    targetRoleIsOwner: true,
  }),
  STAFF_ADMIN_COPY.cannotResetOwnPassword,
);
assert.equal(
  staffAdminPasswordResetError({
    actorStaffId: "owner-2",
    targetStaffId: "master-1",
    actorRole: "owner",
    targetIsMasterOwner: true,
    targetRoleIsOwner: true,
  }),
  STAFF_ADMIN_COPY.cannotChangeMaster,
);
assert.equal(
  staffAdminPasswordResetError({
    actorStaffId: "owner-1",
    targetStaffId: "bakery-1",
    actorRole: "owner",
    targetRoleIsOwner: false,
  }),
  null,
);
assert.equal(
  staffAdminPasswordResetError({
    actorStaffId: "owner-1",
    targetStaffId: "owner-2",
    actorRole: "owner",
    targetIsMasterOwner: false,
    targetRoleIsOwner: true,
  }),
  null,
);
assert.equal(
  staffAdminPasswordResetError({
    actorStaffId: "owner-1",
    targetStaffId: "owner-1",
    actorRole: "owner",
    targetRoleIsOwner: true,
  }),
  STAFF_ADMIN_COPY.cannotResetOwnPassword,
);
assert.equal(
  staffAdminPasswordResetError({
    actorStaffId: "manager-1",
    targetStaffId: "bakery-1",
    actorRole: "manager",
    targetRoleIsOwner: false,
  }),
  null,
);
assert.equal(
  staffAdminPasswordResetError({
    actorStaffId: "manager-1",
    targetStaffId: "owner-2",
    actorRole: "manager",
    targetIsMasterOwner: false,
    targetRoleIsOwner: true,
  }),
  STAFF_ADMIN_COPY.cannotManageOwner,
);
assert.equal(
  staffAdminPasswordResetError({
    actorStaffId: "manager-1",
    targetStaffId: "master-1",
    actorRole: "manager",
    targetIsMasterOwner: true,
    targetRoleIsOwner: true,
  }),
  STAFF_ADMIN_COPY.cannotChangeMaster,
);
assert.equal(
  staffAdminPasswordResetError({
    actorStaffId: "manager-1",
    targetStaffId: "manager-1",
    actorRole: "manager",
    targetRoleIsOwner: false,
  }),
  STAFF_ADMIN_COPY.cannotResetOwnPassword,
);
assert.equal(
  staffAdminPasswordResetError({
    actorStaffId: "unknown-1",
    targetStaffId: "bakery-1",
    actorRole: missingActorRole,
    targetRoleIsOwner: false,
  }),
  STAFF_ADMIN_COPY.unauthorized,
);
assert.equal(
  staffAdminPasswordResetError({
    actorStaffId: "unknown-1",
    targetStaffId: "owner-2",
    actorRole: missingActorRole,
    targetRoleIsOwner: true,
  }),
  STAFF_ADMIN_COPY.unauthorized,
);
assert.equal(
  staffAdminPasswordResetError({
    actorStaffId: "unknown-1",
    targetStaffId: "owner-2",
    actorRole: invalidActorRole,
    targetRoleIsOwner: true,
  }),
  STAFF_ADMIN_COPY.unauthorized,
);
assert.equal(
  staffAdminPasswordResetError({
    actorStaffId: "owner-1",
    targetStaffId: "bakery-1",
    actorRole: "owner",
    targetRoleIsOwner: false,
    targetIsArchived: true,
  }),
  STAFF_ADMIN_COPY.cannotResetArchivedPassword,
);
assert.equal(
  staffAdminActorError("bakery"),
  STAFF_ADMIN_COPY.unauthorized,
);
assert.equal(
  staffAdminActorError("collection"),
  STAFF_ADMIN_COPY.unauthorized,
);
assert.equal(
  staffAdminActorError("customer_operations"),
  STAFF_ADMIN_COPY.unauthorized,
);

const guardsSource = readFileSync(
  resolve("src/foundation/staff/admin-guards.ts"),
  "utf8",
);
assert.match(guardsSource, /actorRole: RoleCode;/);
assert.doesNotMatch(guardsSource, /actorRole\?:/);
assert.match(guardsSource, /targetRoleIsOwner !== false/);

const migration = readFileSync(
  resolve("supabase/migrations/20260911120000_staff_master_owner.sql"),
  "utf8",
);
assert.match(migration, /is_master_owner boolean not null default false/);
assert.match(migration, /staff_profiles_one_master_owner_idx/);
assert.match(migration, /where is_master_owner = true/);
assert.match(migration, /create or replace function public\.transfer_master_owner/);
assert.match(migration, /security definer/);
assert.match(migration, /set search_path = public/);
assert.match(migration, /for update/);
assert.match(migration, /revoke all on function public\.transfer_master_owner/);
assert.match(migration, /from public, anon, authenticated/);
assert.match(migration, /grant execute on function public\.transfer_master_owner/);
assert.match(migration, /to service_role/);
assert.match(migration, /app\.allow_master_transfer/);
assert.match(migration, /Master Owner must remain active/);
assert.match(migration, /Master Owner must have the Owner role/);
assert.doesNotMatch(migration, /ownerdev/);
assert.doesNotMatch(migration, /role\s*=\s*'master_owner'/);
assert.doesNotMatch(
  migration,
  /update public\.staff_profiles\s+set is_master_owner = true\s+where username/i,
);
assert.doesNotMatch(migration, /alter role/);

const sessionSource = readFileSync(
  resolve("src/foundation/auth/session.ts"),
  "utf8",
);
assert.match(sessionSource, /getStaffByAuthUserId/);
assert.doesNotMatch(sessionSource, /isMasterOwner:/);
assert.doesNotMatch(sessionSource, /user_metadata/);

console.log("test-staff-admin: PASS");
