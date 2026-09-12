/**
 * Staff archive lifecycle: Active → Deactivated → Archived.
 * Run: npx tsx scripts/test-staff-archive.ts
 *
 * Live Auth archive/restore round-trips are not executed here.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  STAFF_ADMIN_COPY,
  staffAdminArchiveError,
  staffAdminPasswordResetError,
  staffAdminRestoreError,
} from "@/foundation/staff/admin-guards";
import {
  isStaffArchived,
  partitionStaffForAdmin,
  type StaffAdminListItem,
} from "@/foundation/staff/queries";
import type { Role } from "@/types/staff";

const bakeryRole: Role = { id: "role-bakery", code: "bakery", name: "Bakery" };
const ownerRole: Role = { id: "role-owner", code: "owner", name: "Owner" };

function member(
  input: Partial<StaffAdminListItem> & Pick<StaffAdminListItem, "id">,
): StaffAdminListItem {
  return {
    username: input.username ?? input.id,
    email: input.email ?? `${input.id}@whitebird.asia`,
    displayName: input.displayName ?? input.id,
    isActive: input.isActive ?? true,
    archivedAt: input.archivedAt ?? null,
    isMasterOwner: input.isMasterOwner ?? false,
    role: input.role ?? bakeryRole,
    ...input,
  };
}

assert.equal(isStaffArchived(null), false);
assert.equal(isStaffArchived(undefined), false);
assert.equal(isStaffArchived("2026-09-12T02:00:00.000Z"), true);

const split = partitionStaffForAdmin([
  member({
    id: "archived-1",
    displayName: "Archived",
    isActive: false,
    archivedAt: "2026-09-12T02:00:00.000Z",
    role: ownerRole,
  }),
  member({ id: "inactive-1", displayName: "Inactive", isActive: false }),
  member({ id: "active-1", displayName: "Active", isActive: true }),
]);
assert.deepEqual(
  split.current.map((row) => row.id),
  ["active-1", "inactive-1"],
);
assert.deepEqual(
  split.archived.map((row) => row.id),
  ["archived-1"],
);

assert.equal(
  staffAdminArchiveError({
    actorStaffId: "owner-1",
    targetStaffId: "bakery-1",
    actorRole: "owner",
    targetRoleIsOwner: false,
    targetIsActive: true,
    targetIsArchived: false,
    targetIsActiveOwner: false,
    activeOwnerCount: 2,
  }),
  STAFF_ADMIN_COPY.archiveRequiresDeactivated,
);
assert.equal(
  staffAdminArchiveError({
    actorStaffId: "owner-1",
    targetStaffId: "bakery-1",
    actorRole: "owner",
    targetRoleIsOwner: false,
    targetIsActive: false,
    targetIsArchived: false,
    targetIsActiveOwner: false,
    activeOwnerCount: 2,
  }),
  null,
);
assert.equal(
  staffAdminArchiveError({
    actorStaffId: "owner-1",
    targetStaffId: "bakery-1",
    actorRole: "owner",
    targetRoleIsOwner: false,
    targetIsActive: false,
    targetIsArchived: true,
    targetIsActiveOwner: false,
    activeOwnerCount: 2,
  }),
  STAFF_ADMIN_COPY.alreadyArchived,
);
assert.equal(
  staffAdminArchiveError({
    actorStaffId: "owner-1",
    targetStaffId: "owner-1",
    actorRole: "owner",
    targetRoleIsOwner: true,
    targetIsActive: false,
    targetIsArchived: false,
    targetIsActiveOwner: false,
    activeOwnerCount: 2,
  }),
  STAFF_ADMIN_COPY.cannotArchiveSelf,
);
assert.equal(
  staffAdminArchiveError({
    actorStaffId: "owner-1",
    targetStaffId: "master-1",
    actorRole: "owner",
    targetRoleIsOwner: true,
    targetIsMasterOwner: true,
    targetIsActive: false,
    targetIsArchived: false,
    targetIsActiveOwner: false,
    activeOwnerCount: 2,
  }),
  STAFF_ADMIN_COPY.cannotArchiveMaster,
);
assert.equal(
  staffAdminArchiveError({
    actorStaffId: "manager-1",
    targetStaffId: "owner-2",
    actorRole: "manager",
    targetRoleIsOwner: true,
    targetIsActive: false,
    targetIsArchived: false,
    targetIsActiveOwner: false,
    activeOwnerCount: 2,
  }),
  STAFF_ADMIN_COPY.cannotManageOwner,
);
assert.equal(
  staffAdminArchiveError({
    actorStaffId: "manager-1",
    targetStaffId: "bakery-1",
    actorRole: "manager",
    targetRoleIsOwner: false,
    targetIsActive: false,
    targetIsArchived: false,
    targetIsActiveOwner: false,
    activeOwnerCount: 1,
  }),
  null,
);
assert.equal(
  staffAdminArchiveError({
    actorStaffId: "owner-1",
    targetStaffId: "owner-2",
    actorRole: "owner",
    targetRoleIsOwner: true,
    targetIsActive: true,
    targetIsArchived: false,
    targetIsActiveOwner: true,
    activeOwnerCount: 1,
  }),
  STAFF_ADMIN_COPY.archiveRequiresDeactivated,
);
assert.equal(
  staffAdminArchiveError({
    actorStaffId: "owner-1",
    targetStaffId: "owner-2",
    actorRole: "owner",
    targetRoleIsOwner: true,
    targetIsActive: false,
    targetIsArchived: false,
    targetIsActiveOwner: false,
    activeOwnerCount: 1,
  }),
  null,
);

const missingActorRole = "" as unknown as "owner";
assert.equal(
  staffAdminArchiveError({
    actorStaffId: "unknown-1",
    targetStaffId: "owner-2",
    actorRole: missingActorRole,
    targetRoleIsOwner: true,
    targetIsActive: false,
    targetIsArchived: false,
    targetIsActiveOwner: false,
    activeOwnerCount: 2,
  }),
  STAFF_ADMIN_COPY.cannotManageOwner,
);

assert.equal(
  staffAdminRestoreError({
    actorStaffId: "owner-1",
    targetStaffId: "bakery-1",
    actorRole: "owner",
    targetRoleIsOwner: false,
    targetIsArchived: true,
  }),
  null,
);
assert.equal(
  staffAdminRestoreError({
    actorStaffId: "owner-1",
    targetStaffId: "bakery-1",
    actorRole: "owner",
    targetRoleIsOwner: false,
    targetIsArchived: false,
  }),
  STAFF_ADMIN_COPY.notArchived,
);
assert.equal(
  staffAdminRestoreError({
    actorStaffId: "manager-1",
    targetStaffId: "owner-2",
    actorRole: "manager",
    targetRoleIsOwner: true,
    targetIsArchived: true,
  }),
  STAFF_ADMIN_COPY.cannotManageOwner,
);
assert.equal(
  staffAdminRestoreError({
    actorStaffId: "owner-1",
    targetStaffId: "master-1",
    actorRole: "owner",
    targetRoleIsOwner: true,
    targetIsMasterOwner: true,
    targetIsArchived: true,
  }),
  STAFF_ADMIN_COPY.cannotArchiveMaster,
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
  staffAdminPasswordResetError({
    actorStaffId: "owner-1",
    targetStaffId: "bakery-1",
    actorRole: "owner",
    targetRoleIsOwner: false,
    targetIsArchived: false,
  }),
  null,
);

const adminActions = readFileSync(
  resolve("src/foundation/staff/admin-actions.ts"),
  "utf8",
);
assert.match(adminActions, /export async function archiveManagedStaffAction/);
assert.match(adminActions, /export async function restoreManagedStaffAction/);
assert.match(adminActions, /is_active:\s*false/);
assert.match(adminActions, /archived_at:\s*new Date\(\)\.toISOString\(\)/);
assert.match(adminActions, /archived_at:\s*null/);
assert.match(adminActions, /staff_operational_designations/);
assert.match(adminActions, /\.delete\(\)\s*\.eq\("staff_id"/);
assert.match(adminActions, /signOut\(authUserId,\s*"global"\)/);
assert.match(adminActions, /archiveSessionWarning/);
assert.match(adminActions, /restoreBeforeReactivate/);
assert.match(
  adminActions,
  /restoreManagedStaffAction[\s\S]*is_active:\s*false[\s\S]*archived_at:\s*null/,
);
assert.doesNotMatch(
  adminActions,
  /restoreManagedStaffAction[\s\S]*staff_operational_designations[\s\S]*insert/,
);
assert.doesNotMatch(adminActions, /archiveManagedStaffAction[\s\S]*deleteUser/);
assert.doesNotMatch(adminActions, /restoreManagedStaffAction[\s\S]*deleteUser/);
assert.doesNotMatch(adminActions, /from\("staff_profiles"\)[\s\S]{0,80}\.delete\(/);
assert.doesNotMatch(adminActions, /auth\.admin\.deleteUser\(target/);
assert.doesNotMatch(adminActions, /updateUserById/);

const resetActions = readFileSync(
  resolve("src/foundation/staff/admin-password-actions.ts"),
  "utf8",
);
assert.match(resetActions, /targetIsArchived:\s*Boolean\(target\.archivedAt\)/);

const loginActions = readFileSync(
  resolve("src/foundation/auth/actions.ts"),
  "utf8",
);
assert.match(loginActions, /!staff \|\| !staff\.isActive/);
assert.doesNotMatch(loginActions, /archivedAt|archived_at/);

const session = readFileSync(resolve("src/foundation/auth/session.ts"), "utf8");
assert.match(session, /!staff \|\| !staff\.isActive/);
assert.doesNotMatch(session, /archivedAt|archived_at/);

const passkeys = readFileSync(resolve("src/foundation/auth/passkeys.ts"), "utf8");
assert.doesNotMatch(passkeys, /archivedAt|archived_at|archiveManagedStaff/);

const directory = readFileSync(
  resolve("src/components/settings/StaffAdminDirectory.tsx"),
  "utf8",
);
assert.match(directory, /Archived Staff/);
assert.match(directory, /canArchive/);
assert.match(directory, />\s*Archive\s*</);
assert.match(directory, />\s*Restore\s*</);
const archivedCardStart = directory.indexOf("function ArchivedStaffCard");
assert.ok(archivedCardStart > 0);
const archivedCardSource = directory.slice(archivedCardStart);
assert.doesNotMatch(archivedCardSource, /Reset password/);
assert.doesNotMatch(archivedCardSource, /Deactivate|Reactivate/);
assert.match(archivedCardSource, />\s*Restore\s*</);
assert.doesNotMatch(directory, /Delete Account/);
assert.match(directory, /STAFF_ADMIN_COPY\.archiveConfirm/);
assert.match(directory, /STAFF_ADMIN_COPY\.restoreConfirm/);
assert.match(directory, /STAFF_ADMIN_COPY\.archivedStatus/);

const queries = readFileSync(resolve("src/foundation/staff/queries.ts"), "utf8");
assert.match(queries, /\.is\("archived_at", null\)/);
assert.doesNotMatch(
  queries,
  /countActiveOwners[\s\S]*archived_at/,
);

const attributionFiles = [
  "src/workspaces/owner/orders/queries.ts",
  "src/workspaces/owner/approvals/queries.ts",
  "src/workspaces/library/order-availability/queries.ts",
  "src/workspaces/library/order-availability/capacity/queries.ts",
  "src/workspaces/extra/queries.ts",
  "src/workspaces/customer-operations/orders/queries.ts",
];
for (const path of attributionFiles) {
  const source = readFileSync(resolve(path), "utf8");
  assert.doesNotMatch(source, /archived_at/);
  assert.doesNotMatch(
    source,
    /from\("staff_profiles"\)[\s\S]{0,200}\.eq\("is_active"/,
  );
}

const designations = readFileSync(
  resolve("src/workspaces/owner/approvals/designations.ts"),
  "utf8",
);
assert.doesNotMatch(designations, /archived_at|archiveManagedStaff/);

const migration = readFileSync(
  resolve("supabase/migrations/20260912120000_staff_profiles_archived_at.sql"),
  "utf8",
);
assert.match(migration, /add column if not exists archived_at timestamptz/);
assert.match(
  migration,
  /archived_at is null or is_active = false/,
);
assert.match(migration, /staff_profiles_archived_at_idx/);
assert.doesNotMatch(migration, /is_archived/);
assert.doesNotMatch(migration, /update public\.staff_profiles/i);
assert.doesNotMatch(migration, /enable row level security|create policy|drop policy/);
assert.doesNotMatch(migration, /auth_user_id|is_master_owner|must_change_password/);
assert.doesNotMatch(migration, /delete from/i);

console.log("test-staff-archive: PASS");
