"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  archiveManagedStaffAction,
  restoreManagedStaffAction,
  setManagedStaffActiveAction,
  transferMasterOwnerAction,
  updateManagedStaffRoleAction,
  updateManagedStaffUsernameAction,
} from "@/foundation/staff/admin-actions";
import { resetManagedStaffPasswordAction } from "@/foundation/staff/admin-password-actions";
import {
  STAFF_ADMIN_COPY,
  canManageOwnerStaff,
} from "@/foundation/staff/admin-guards";
import {
  STAFF_USERNAME_COPY,
  normalizeStaffUsername,
  staffUsernamesMatch,
  validateStaffUsername,
} from "@/foundation/staff/username";
import type { StaffAdminListItem } from "@/foundation/staff/queries";
import type { Role, RoleCode } from "@/types/staff";

type StaffAdminDirectoryProps = {
  actorIsMasterOwner: boolean;
  actorRole: RoleCode;
  actorStaffId: string;
  roles: Role[];
  staff: StaffAdminListItem[];
  archivedStaff: StaffAdminListItem[];
};

function formatArchivedOn(archivedAt: string): string {
  const date = new Date(archivedAt);
  if (Number.isNaN(date.getTime())) return "Archived";
  return `Archived ${date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;
}

export function StaffAdminDirectory({
  actorIsMasterOwner,
  actorRole,
  actorStaffId,
  roles,
  staff,
  archivedStaff,
}: StaffAdminDirectoryProps) {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h3 className="text-ink text-sm font-semibold">Staff</h3>
        {staff.length === 0 ? (
          <p className="text-skyline text-sm">No staff accounts yet.</p>
        ) : (
          <ul className="space-y-3">
            {staff.map((member) => (
              <StaffAdminMemberCard
                actorIsMasterOwner={actorIsMasterOwner}
                actorRole={actorRole}
                actorStaffId={actorStaffId}
                key={member.id}
                member={member}
                roles={roles}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <details className="group">
          <summary className="text-skyline hover:text-ink cursor-pointer list-none text-sm font-medium">
            <span className="inline-flex items-center gap-2">
              <span className="group-open:hidden">▸</span>
              <span className="hidden group-open:inline">▾</span>
              Archived Staff
              {archivedStaff.length > 0 ? (
                <span className="text-xs font-normal">
                  ({archivedStaff.length})
                </span>
              ) : null}
            </span>
          </summary>
          <p className="text-skyline mt-2 text-xs">
            Archived staff remain in Whitebird for historical records and cannot
            sign in.
          </p>
          {archivedStaff.length === 0 ? (
            <p className="text-skyline mt-3 text-sm">No archived staff.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {archivedStaff.map((member) => (
                <ArchivedStaffCard
                  actorRole={actorRole}
                  actorStaffId={actorStaffId}
                  key={member.id}
                  member={member}
                />
              ))}
            </ul>
          )}
        </details>
      </section>
    </div>
  );
}

function StaffAdminMemberCard({
  actorIsMasterOwner,
  actorRole,
  actorStaffId,
  member,
  roles,
}: {
  actorIsMasterOwner: boolean;
  actorRole: RoleCode;
  actorStaffId: string;
  member: StaffAdminListItem;
  roles: Role[];
}) {
  const router = useRouter();
  const isSelf = member.id === actorStaffId;
  const masterLocked = member.isMasterOwner;
  const ownerLocked =
    member.role.code === "owner" && !canManageOwnerStaff(actorRole);
  const controlsDisabled = isSelf || masterLocked || ownerLocked;
  const canTransferMaster =
    actorIsMasterOwner &&
    !isSelf &&
    !member.isMasterOwner &&
    member.isActive &&
    member.role.code === "owner";
  const canResetPassword =
    !isSelf && !masterLocked && !ownerLocked && !member.archivedAt;
  const canArchive =
    !isSelf && !masterLocked && !ownerLocked && !member.isActive;
  const roleOptions = roles.filter((role) => {
    if (role.code !== "owner") return true;
    if (!canManageOwnerStaff(actorRole)) {
      return member.role.code === "owner";
    }
    if (actorIsMasterOwner) return true;
    return member.role.code === "owner";
  });
  const [username, setUsername] = useState(member.username);
  const [roleCode, setRoleCode] = useState(member.role.code);
  const [saving, setSaving] = useState(false);
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [confirmingTransfer, setConfirmingTransfer] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(
    null,
  );
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const usernameChanged = !staffUsernamesMatch(username, member.username);
  const roleChanged = roleCode !== member.role.code;

  async function run(
    action: () => Promise<{ error: string | null; warning?: string | null }>,
  ) {
    setSaving(true);
    setMessage(null);
    setWarning(null);
    setError(null);
    const result = await action();
    if (result.warning) {
      setWarning(result.warning);
    }
    if (result.error) {
      setError(result.error);
    } else {
      setConfirmingDeactivate(false);
      setConfirmingArchive(false);
      setConfirmingTransfer(false);
      setConfirmingReset(false);
      router.refresh();
    }
    setSaving(false);
    return result;
  }

  async function saveUsername() {
    const validationError = validateStaffUsername(username);
    if (validationError) {
      setError(validationError);
      return;
    }
    const formData = new FormData();
    formData.set("staffId", member.id);
    formData.set("username", normalizeStaffUsername(username));
    const result = await run(() => updateManagedStaffUsernameAction(formData));
    if (!result.error) {
      setMessage(STAFF_ADMIN_COPY.usernameSuccess);
    }
  }

  async function saveRole() {
    const formData = new FormData();
    formData.set("staffId", member.id);
    formData.set("role", roleCode);
    const result = await run(() => updateManagedStaffRoleAction(formData));
    if (!result.error) {
      setMessage(STAFF_ADMIN_COPY.roleSuccess);
    }
  }

  async function setActive(nextActive: boolean) {
    const formData = new FormData();
    formData.set("staffId", member.id);
    formData.set("isActive", nextActive ? "true" : "false");
    const result = await run(() => setManagedStaffActiveAction(formData));
    if (!result.error) {
      setMessage(
        nextActive
          ? STAFF_ADMIN_COPY.reactivated
          : STAFF_ADMIN_COPY.deactivated,
      );
    }
  }

  async function archiveStaff() {
    const formData = new FormData();
    formData.set("staffId", member.id);
    const result = await run(() => archiveManagedStaffAction(formData));
    if (result.warning) {
      setWarning(result.warning);
    }
    if (!result.error) {
      setMessage(STAFF_ADMIN_COPY.archived);
    }
  }

  async function transferMaster() {
    const formData = new FormData();
    formData.set("staffId", member.id);
    const result = await run(() => transferMasterOwnerAction(formData));
    if (!result.error) {
      setMessage(STAFF_ADMIN_COPY.transferSuccess);
    }
  }

  async function resetPassword() {
    setSaving(true);
    setMessage(null);
    setWarning(null);
    setError(null);
    setCopied(false);
    setPasswordVisible(false);

    const formData = new FormData();
    formData.set("staffId", member.id);
    const result = await resetManagedStaffPasswordAction(formData);

    if (result.temporaryPassword) {
      setTemporaryPassword(result.temporaryPassword);
      setConfirmingReset(false);
    }

    if (result.warning) {
      setWarning(result.warning);
    }

    if (result.error) {
      setError(result.error);
    } else if (result.success) {
      setMessage(STAFF_ADMIN_COPY.resetSuccess);
    }

    setSaving(false);
  }

  async function copyTemporaryPassword() {
    if (!temporaryPassword) return;
    await navigator.clipboard.writeText(temporaryPassword);
    setCopied(true);
  }

  function dismissTemporaryPassword() {
    setTemporaryPassword(null);
    setPasswordVisible(false);
    setCopied(false);
    setWarning(null);
  }

  return (
    <li className="border-fog rounded-xl border bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-ink text-sm font-medium">
            {member.displayName}
            {member.isMasterOwner ? (
              <span className="text-signal ml-2 text-xs font-medium">
                Master Owner
              </span>
            ) : null}
            {isSelf ? (
              <span className="text-signal ml-2 text-xs font-medium">You</span>
            ) : null}
          </p>
          <p className="text-skyline mt-0.5 text-xs">
            @{member.username} · {member.role.name}
          </p>
          <p className="text-skyline mt-1 text-xs">{member.email ?? "No email"}</p>
        </div>
        <p
          className={
            member.isActive
              ? "text-xs font-medium text-emerald-700"
              : "text-xs font-medium text-amber-700"
          }
        >
          {member.isActive ? "Active" : "Inactive"}
        </p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-skyline flex flex-col gap-1.5 text-xs">
          Username
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className="border-fog text-ink min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:border-signal focus:ring-2 focus:ring-signal/10 disabled:opacity-60"
              disabled={saving || controlsDisabled}
              onChange={(event) => setUsername(event.target.value)}
              spellCheck={false}
              type="text"
              value={username}
            />
            <button
              className="border-fog text-ink rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-60"
              disabled={saving || controlsDisabled || !usernameChanged}
              onClick={() => void saveUsername()}
              type="button"
            >
              Save username
            </button>
          </div>
          {isSelf ? (
            <span>{STAFF_ADMIN_COPY.cannotEditOwnUsername}</span>
          ) : masterLocked ? (
            <span>{STAFF_ADMIN_COPY.cannotChangeMaster}</span>
          ) : ownerLocked ? (
            <span>{STAFF_ADMIN_COPY.cannotManageOwner}</span>
          ) : (
            <span>{STAFF_USERNAME_COPY.helper}</span>
          )}
        </label>

        <label className="text-skyline flex flex-col gap-1.5 text-xs">
          Role
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              className="border-fog text-ink min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:border-signal focus:ring-2 focus:ring-signal/10 disabled:opacity-60"
              disabled={saving || controlsDisabled}
              onChange={(event) => setRoleCode(event.target.value as RoleCode)}
              value={roleCode}
            >
              {roleOptions.map((role) => (
                <option key={role.id} value={role.code}>
                  {role.name}
                </option>
              ))}
            </select>
            <button
              className="border-fog text-ink rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-60"
              disabled={saving || controlsDisabled || !roleChanged}
              onClick={() => void saveRole()}
              type="button"
            >
              Save role
            </button>
          </div>
          {masterLocked ? (
            <span>{STAFF_ADMIN_COPY.cannotDemoteMaster}</span>
          ) : ownerLocked ? (
            <span>{STAFF_ADMIN_COPY.cannotManageOwner}</span>
          ) : null}
        </label>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {!isSelf &&
        confirmingDeactivate &&
        member.isActive &&
        !masterLocked &&
        !ownerLocked ? (
          <div className="flex flex-wrap gap-2">
            <button
              className="bg-ink text-mist rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-60"
              disabled={saving}
              onClick={() => void setActive(false)}
              type="button"
            >
              Confirm deactivate
            </button>
            <button
              className="border-fog text-ink rounded-lg border px-3 py-2 text-xs font-medium"
              disabled={saving}
              onClick={() => setConfirmingDeactivate(false)}
              type="button"
            >
              Cancel
            </button>
          </div>
        ) : !isSelf ? (
          <button
            className="border-fog text-ink rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-60"
            disabled={saving || masterLocked || ownerLocked}
            onClick={() => {
              if (member.isActive) {
                setConfirmingDeactivate(true);
                setConfirmingArchive(false);
                setConfirmingTransfer(false);
                setConfirmingReset(false);
                setError(null);
                return;
              }
              void setActive(true);
            }}
            type="button"
          >
            {member.isActive ? "Deactivate" : "Reactivate"}
          </button>
        ) : null}

        {canArchive ? (
          confirmingArchive ? (
            <div className="space-y-2">
              <p className="text-ink text-sm font-medium">
                Archive {member.displayName}?
              </p>
              <p className="text-skyline text-xs">
                {STAFF_ADMIN_COPY.archiveConfirm}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  className="bg-ink text-mist rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-60"
                  disabled={saving}
                  onClick={() => void archiveStaff()}
                  type="button"
                >
                  Confirm archive
                </button>
                <button
                  className="border-fog text-ink rounded-lg border px-3 py-2 text-xs font-medium"
                  disabled={saving}
                  onClick={() => setConfirmingArchive(false)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              className="border-fog text-ink rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-60"
              disabled={saving}
              onClick={() => {
                setConfirmingArchive(true);
                setConfirmingDeactivate(false);
                setConfirmingTransfer(false);
                setConfirmingReset(false);
                setError(null);
              }}
              type="button"
            >
              Archive
            </button>
          )
        ) : null}

        {canTransferMaster ? (
          confirmingTransfer ? (
            <div className="space-y-2">
              <p className="text-skyline text-xs">
                {member.displayName} will become the Master Owner. This account
                will become an ordinary Owner.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  className="bg-ink text-mist rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-60"
                  disabled={saving}
                  onClick={() => void transferMaster()}
                  type="button"
                >
                  Confirm transfer
                </button>
                <button
                  className="border-fog text-ink rounded-lg border px-3 py-2 text-xs font-medium"
                  disabled={saving}
                  onClick={() => setConfirmingTransfer(false)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              className="border-fog text-ink rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-60"
              disabled={saving}
              onClick={() => {
                setConfirmingTransfer(true);
                setConfirmingDeactivate(false);
                setConfirmingArchive(false);
                setConfirmingReset(false);
                setError(null);
              }}
              type="button"
            >
              Transfer Master Owner
            </button>
          )
        ) : null}

        {canResetPassword && temporaryPassword ? (
          <div className="border-fog space-y-3 rounded-lg border p-3">
            <p className="text-ink text-sm font-medium">
              {STAFF_ADMIN_COPY.resetSuccess}
            </p>
            <p className="text-skyline text-xs">Temporary password</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                className="border-fog text-ink min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 font-mono text-sm"
                readOnly
                type={passwordVisible ? "text" : "password"}
                value={temporaryPassword}
              />
              <button
                className="border-fog text-ink rounded-lg border px-3 py-2 text-xs font-medium"
                onClick={() => setPasswordVisible((visible) => !visible)}
                type="button"
              >
                {passwordVisible ? "Hide" : "Show"}
              </button>
              <button
                className="border-fog text-ink rounded-lg border px-3 py-2 text-xs font-medium"
                onClick={() => void copyTemporaryPassword()}
                type="button"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="text-skyline text-xs">{STAFF_ADMIN_COPY.resetHandoff}</p>
            <button
              className="border-fog text-ink rounded-lg border px-3 py-2 text-xs font-medium"
              onClick={dismissTemporaryPassword}
              type="button"
            >
              Done
            </button>
          </div>
        ) : canResetPassword && confirmingReset ? (
          <div className="space-y-2">
            <p className="text-ink text-sm font-medium">
              Reset password for {member.displayName}?
            </p>
            <p className="text-skyline text-xs">{STAFF_ADMIN_COPY.resetConfirm}</p>
            <div className="flex flex-wrap gap-2">
              <button
                className="bg-ink text-mist rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-60"
                disabled={saving}
                onClick={() => void resetPassword()}
                type="button"
              >
                Confirm reset
              </button>
              <button
                className="border-fog text-ink rounded-lg border px-3 py-2 text-xs font-medium"
                disabled={saving}
                onClick={() => setConfirmingReset(false)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : canResetPassword ? (
          <button
            className="border-fog text-ink rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-60"
            disabled={saving}
            onClick={() => {
              setConfirmingReset(true);
              setConfirmingDeactivate(false);
              setConfirmingArchive(false);
              setConfirmingTransfer(false);
              setError(null);
              setMessage(null);
            }}
            type="button"
          >
            Reset password
          </button>
        ) : null}
      </div>

      {message && !temporaryPassword ? (
        <p className="mt-3 text-sm text-signal" role="status">
          {message}
        </p>
      ) : null}
      {warning ? (
        <p className="mt-3 text-sm text-amber-700" role="status">
          {warning}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  );
}

function ArchivedStaffCard({
  actorRole,
  actorStaffId,
  member,
}: {
  actorRole: RoleCode;
  actorStaffId: string;
  member: StaffAdminListItem;
}) {
  const router = useRouter();
  const isSelf = member.id === actorStaffId;
  const ownerLocked =
    member.role.code === "owner" && !canManageOwnerStaff(actorRole);
  const canRestore = !isSelf && !member.isMasterOwner && !ownerLocked;
  const [saving, setSaving] = useState(false);
  const [confirmingRestore, setConfirmingRestore] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function restoreStaff() {
    setSaving(true);
    setMessage(null);
    setError(null);
    const formData = new FormData();
    formData.set("staffId", member.id);
    const result = await restoreManagedStaffAction(formData);
    if (result.error) {
      setError(result.error);
    } else {
      setConfirmingRestore(false);
      setMessage(STAFF_ADMIN_COPY.restored);
      router.refresh();
    }
    setSaving(false);
  }

  return (
    <li className="border-fog rounded-xl border border-dashed bg-slate-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-ink text-sm font-medium">{member.displayName}</p>
          <p className="text-skyline mt-0.5 text-xs">
            @{member.username} · {member.role.name}
          </p>
          <p className="text-skyline mt-1 text-xs">{member.email ?? "No email"}</p>
          <p className="text-skyline mt-2 text-xs">
            {member.archivedAt
              ? formatArchivedOn(member.archivedAt)
              : "Archived"}
          </p>
        </div>
        <p className="text-xs font-medium text-slate-600">Archived</p>
      </div>
      <p className="text-skyline mt-3 text-xs">{STAFF_ADMIN_COPY.archivedStatus}</p>
      {canRestore ? (
        confirmingRestore ? (
          <div className="mt-4 space-y-2">
            <p className="text-skyline text-xs">{STAFF_ADMIN_COPY.restoreConfirm}</p>
            <div className="flex flex-wrap gap-2">
              <button
                className="bg-ink text-mist rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-60"
                disabled={saving}
                onClick={() => void restoreStaff()}
                type="button"
              >
                Confirm restore
              </button>
              <button
                className="border-fog text-ink rounded-lg border bg-white px-3 py-2 text-xs font-medium"
                disabled={saving}
                onClick={() => setConfirmingRestore(false)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            className="border-fog text-ink mt-4 rounded-lg border bg-white px-3 py-2 text-xs font-medium disabled:opacity-60"
            disabled={saving}
            onClick={() => {
              setConfirmingRestore(true);
              setError(null);
            }}
            type="button"
          >
            Restore
          </button>
        )
      ) : null}
      {message ? (
        <p className="mt-3 text-sm text-signal" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  );
}
