/**
 * Staff credential-change audit logging.
 * Run: npx tsx scripts/test-staff-credential-audit.ts
 *
 * Live Auth/Passkey ceremonies are not executed here. Wiring, sanitization,
 * and authorization are asserted from source plus unit helpers.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  STAFF_CREDENTIAL_AUDIT_COPY,
  STAFF_CREDENTIAL_EVENT_LABELS,
  STAFF_CREDENTIAL_EVENT_TYPES,
  buildStaffCredentialEventRow,
  formatStaffCredentialActivityDetail,
  sanitizeStaffCredentialMetadata,
  staffCredentialAuditWarning,
} from "@/foundation/staff/credential-audit";

function readSource(path: string) {
  return readFileSync(resolve(path), "utf8");
}

function extractFunction(source: string, name: string): string {
  const start = source.search(
    new RegExp(`(?:export )?async function ${name}\\b`),
  );
  assert.ok(start >= 0, `missing function ${name}`);
  const rest = source.slice(start + 1);
  const next = rest.search(/\n(?:export )?async function |\nexport function /);
  return next === -1 ? source.slice(start) : source.slice(start, start + 1 + next);
}

function assertRecordedOnceAfterFailures(
  fn: string,
  eventType: string,
  failureMarkers: RegExp[],
) {
  const recordIndex = fn.search(/recordStaffCredentialEvent\s*\(/);
  assert.ok(recordIndex >= 0, `expected one audit write for ${eventType}`);
  assert.equal(
    fn.split(/recordStaffCredentialEvent\s*\(/).length - 1,
    1,
    `expected exactly one audit write for ${eventType}`,
  );
  assert.match(fn.slice(recordIndex), new RegExp(`eventType:\\s*"${eventType}"`));
  for (const marker of failureMarkers) {
    const failureIndex = fn.search(marker);
    assert.ok(failureIndex >= 0, `missing failure path ${marker}`);
    assert.ok(
      failureIndex < recordIndex,
      `failed ${eventType} path must not write an audit event`,
    );
  }
}

const SAFE_TEST_USERNAME = "audit.staff";
const SAFE_TEST_EMAIL = "audit.staff@example.test";

assert.deepEqual(STAFF_CREDENTIAL_EVENT_TYPES, [
  "username_changed",
  "email_changed",
  "password_changed",
  "admin_password_reset",
  "passkey_added",
  "passkey_removed",
]);

const sanitized = sanitizeStaffCredentialMetadata({
  old_username: `  ${SAFE_TEST_USERNAME}  `,
  new_username: "audit.staff.two",
  password: "should-not-store",
  new_password: "should-not-store",
  current_password: "should-not-store",
  password_hash: "should-not-store",
  hash: "should-not-store",
  token: "should-not-store",
  access_token: "should-not-store",
  secret: "should-not-store",
  private_key: "should-not-store",
  credential_id: "should-not-store",
  raw_id: "should-not-store",
  passkey_id: "should-not-store",
  label: "Lily laptop",
});

assert.deepEqual(sanitized, {
  old_username: SAFE_TEST_USERNAME,
  new_username: "audit.staff.two",
  label: "Lily laptop",
});
assert.equal(
  JSON.stringify(sanitized).includes("should-not-store"),
  false,
);
assert.doesNotMatch(JSON.stringify(sanitized), /password|hash|token|secret/i);

const leaked = buildStaffCredentialEventRow({
  eventType: "password_changed",
  actorStaffId: "actor-1",
  subjectStaffId: "subject-1",
  metadata: {
    source: "self_service",
    password: "should-not-store",
    new_password: "should-not-store",
    current_password: "should-not-store",
    password_hash: "should-not-store",
  },
});
assert.deepEqual(leaked.metadata, { source: "self_service" });
assert.doesNotMatch(JSON.stringify(leaked), /should-not-store/);
assert.doesNotMatch(JSON.stringify(leaked), /password_hash|current_password|new_password/);

const passkeyRow = buildStaffCredentialEventRow({
  eventType: "passkey_added",
  actorStaffId: "actor-1",
  subjectStaffId: "actor-1",
  metadata: {
    label: "Passkey",
    credential_id: "should-not-store",
    raw_id: "should-not-store",
    private_key: "should-not-store",
    passkey_id: "should-not-store",
  },
});
assert.deepEqual(passkeyRow.metadata, { label: "Passkey" });
assert.doesNotMatch(JSON.stringify(passkeyRow), /should-not-store|private_key|credential_id/);

assert.equal(
  formatStaffCredentialActivityDetail("username_changed", {
    old_username: "lily_old",
    new_username: "lily_new",
    password: "should-not-store",
  }),
  "lily_old → lily_new",
);
assert.equal(
  formatStaffCredentialActivityDetail("email_changed", {
    old_email: "old@example.test",
    new_email: SAFE_TEST_EMAIL,
    password_hash: "should-not-store",
  }),
  `old@example.test → ${SAFE_TEST_EMAIL}`,
);
assert.equal(
  formatStaffCredentialActivityDetail("passkey_removed", {
    label: "Lily laptop",
    credential_id: "should-not-store",
  }),
  "Lily laptop",
);
assert.equal(STAFF_CREDENTIAL_EVENT_LABELS.admin_password_reset, "Password reset");
assert.equal(
  staffCredentialAuditWarning({ ok: false, error: "insert failed" }),
  STAFF_CREDENTIAL_AUDIT_COPY.recordFailedAfterChange,
);
assert.equal(staffCredentialAuditWarning({ ok: true }), null);

const profileActions = readSource("src/foundation/staff/profile-actions.ts");
const usernameFn = extractFunction(profileActions, "updateStaffUsernameAction");
const emailFn = extractFunction(profileActions, "updateStaffEmailAction");
const passwordFn = extractFunction(profileActions, "updateStaffPasswordAction");
const displayNameFn = extractFunction(profileActions, "updateStaffDisplayNameAction");

assertRecordedOnceAfterFailures(usernameFn, "username_changed", [
  /validateStaffUsername/,
  /STAFF_USERNAME_COPY\.taken/,
  /STAFF_USERNAME_COPY\.failed/,
  /success:\s*false/,
]);
assert.match(usernameFn, /old_username:\s*staff\.username/);
assert.match(usernameFn, /new_username:\s*username/);
assert.match(
  usernameFn,
  /if \(staffUsernamesMatch\(username, staff\.username\)\) \{\s*return \{ error: null, success: true \};/,
);

assertRecordedOnceAfterFailures(emailFn, "email_changed", [
  /Please enter an email address/,
  /Please enter a valid email address/,
  /authError/,
  /profileError/,
  /success:\s*false/,
]);
assert.match(emailFn, /old_email:\s*currentEmail/);
assert.match(emailFn, /new_email:\s*email/);

assertRecordedOnceAfterFailures(passwordFn, "password_changed", [
  /validatePasswordChangeInput/,
  /success:\s*false/,
  /if \(error\) \{/,
]);
assert.match(passwordFn, /source:\s*"self_service"/);
assert.doesNotMatch(passwordFn, /recordStaffCredentialEvent\([\s\S]*currentPassword/);
assert.doesNotMatch(passwordFn, /recordStaffCredentialEvent\([\s\S]*newPassword/);
assert.doesNotMatch(
  passwordFn,
  /updateStaffPasswordAction[\s\S]*createServiceClient/,
);
assert.doesNotMatch(displayNameFn, /recordStaffCredentialEvent/);

const adminActions = readSource("src/foundation/staff/admin-actions.ts");
const managedUsernameFn = extractFunction(
  adminActions,
  "updateManagedStaffUsernameAction",
);
assertRecordedOnceAfterFailures(managedUsernameFn, "username_changed", [
  /success:\s*false/,
  /STAFF_USERNAME_COPY\.taken/,
]);

const resetActions = readSource("src/foundation/staff/admin-password-actions.ts");
const resetFn = extractFunction(resetActions, "resetManagedStaffPasswordAction");
const requireAdminFn = extractFunction(resetActions, "requireStaffAdmin");
assertRecordedOnceAfterFailures(resetFn, "admin_password_reset", [
  /if \(!outcome\.success\)/,
  /return emptyResetResult/,
]);
assert.match(requireAdminFn, /staffAdminActorError/);
assert.match(requireAdminFn, /canManageStaff/);
assert.match(requireAdminFn, /emptyResetResult/);
assert.doesNotMatch(requireAdminFn, /recordStaffCredentialEvent/);
const resetAuditCall = resetFn.match(
  /recordStaffCredentialEvent\(\{[\s\S]*?\n  \}\);/,
);
assert.ok(resetAuditCall, "admin reset must write one audit event");
assert.doesNotMatch(resetAuditCall[0], /temporaryPassword|password:/);

const completeActions = readSource(
  "src/foundation/staff/complete-password-change-actions.ts",
);
const completeFn = extractFunction(
  completeActions,
  "completeForcedPasswordChangeAction",
);
assertRecordedOnceAfterFailures(completeFn, "password_changed", [
  /mustChangePassword/,
  /validateForcedPasswordChangeInput/,
  /authError/,
  /flagClearFailed/,
]);
assert.match(completeFn, /source:\s*"forced_reset_completion"/);
assert.match(completeFn, /recordStaffCredentialEvent\([\s\S]*redirect\(/);
assert.doesNotMatch(completeFn, /recordStaffCredentialEvent\([\s\S]*newPassword/);

const passkeyAction = readSource(
  "src/foundation/staff/credential-audit-actions.ts",
);
assert.match(passkeyAction, /"use server"/);
assert.match(passkeyAction, /export async function recordOwnPasskeyCredentialEventAction/);
assert.match(passkeyAction, /requireStaff\(\)/);
assert.match(passkeyAction, /kind: "added" \| "removed"/);
assert.match(passkeyAction, /passkey_added/);
assert.match(passkeyAction, /passkey_removed/);
assert.match(passkeyAction, /subjectStaffId:\s*staff\.id/);
assert.match(passkeyAction, /actorStaffId:\s*staff\.id/);
assert.doesNotMatch(passkeyAction, /password_changed|username_changed|email_changed|admin_password_reset/);
assert.doesNotMatch(passkeyAction, /formData\.get\("staffId"\)/);
assert.doesNotMatch(passkeyAction, /credential_id|raw_id|private_key|passkey_id/);

const passkeySettings = readSource(
  "src/components/settings/StaffPasskeySettings.tsx",
);
assert.match(
  passkeySettings,
  /registerError[\s\S]*return;[\s\S]*recordOwnPasskeyCredentialEventAction\(\{\s*kind:\s*"added"/,
);
assert.match(
  passkeySettings,
  /deleteError[\s\S]*return;[\s\S]*recordOwnPasskeyCredentialEventAction\(\{\s*kind:\s*"removed"/,
);
assert.match(passkeySettings, /friendlyName \|\| "Passkey"/);
assert.doesNotMatch(passkeySettings, /rawId|privateKey|credential_id/);

const auditHelper = readSource("src/foundation/staff/credential-audit.ts");
assert.match(auditHelper, /createServiceClient\(\)/);
assert.match(auditHelper, /from\("staff_credential_events"\)\.insert\(row\)/);
assert.match(auditHelper, /credential mutation is committed first/);
assert.match(auditHelper, /retries once/);
assert.match(auditHelper, /FORBIDDEN_METADATA_KEY/);
assert.match(auditHelper, /listStaffCredentialEventsForAdmin/);
assert.doesNotMatch(auditHelper, /password_hash|current_password|new_password/);

const migration = readSource(
  "supabase/migrations/20260923180000_staff_credential_events.sql",
);
assert.match(migration, /create table if not exists public\.staff_credential_events/);
assert.match(migration, /username_changed/);
assert.match(migration, /email_changed/);
assert.match(migration, /password_changed/);
assert.match(migration, /admin_password_reset/);
assert.match(migration, /passkey_added/);
assert.match(migration, /passkey_removed/);
assert.match(migration, /enable row level security/);
assert.match(migration, /revoke all on table public\.staff_credential_events from public, anon, authenticated/);
assert.match(migration, /grant select on table public\.staff_credential_events to authenticated/);
assert.match(migration, /grant all on table public\.staff_credential_events to service_role/);
assert.match(migration, /_current_staff_role_code\(\) in \('owner', 'manager'\)/);
assert.doesNotMatch(migration, /for insert|for update|for delete|for all/);
assert.doesNotMatch(migration, /password_hash|current_password|new_password/);
assert.doesNotMatch(migration, /grant .* to anon/);

const staffPage = readSource("src/app/(app)/settings/staff/page.tsx");
assert.match(staffPage, /canManageStaff/);
assert.match(staffPage, /StaffCredentialActivity/);
assert.match(staffPage, /listStaffCredentialEventsForAdmin/);
assert.doesNotMatch(staffPage, /password reset|Passkey/);

const activityUi = readSource(
  "src/components/settings/StaffCredentialActivity.tsx",
);
assert.match(activityUi, /Credential activity/);
assert.match(activityUi, /Performed by/);
assert.match(activityUi, /canManageStaff|Owner|Manager|actorName/);
assert.doesNotMatch(activityUi, /createClient\(|from\("staff_credential_events"\)/);
assert.doesNotMatch(activityUi, /password_hash|current_password|new_password/);

function walkFiles(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(path, files);
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry.name)) files.push(path);
  }
  return files;
}

for (const file of walkFiles(resolve("src/workspaces/storefront"))) {
  assert.doesNotMatch(
    readFileSync(file, "utf8"),
    /staff_credential_events/,
    file,
  );
}

const storefrontBrowse = readSource(
  "src/workspaces/storefront/catalog/BrowseCakeCatalogue.tsx",
);
assert.doesNotMatch(storefrontBrowse, /staff_credential_events|recordStaffCredentialEvent/);

const loginForm = readSource("src/components/LoginForm.tsx");
assert.doesNotMatch(loginForm, /recordStaffCredentialEvent|staff_credential_events/);
assert.match(loginForm, /signInWithPasskey/);

console.log("test-staff-credential-audit: PASS");
