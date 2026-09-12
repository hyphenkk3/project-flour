"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  setManagedStaffActiveAction,
  transferMasterOwnerAction,
  updateManagedStaffRoleAction,
  updateManagedStaffUsernameAction,
} from "@/foundation/staff/admin-actions";
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
};

export function StaffAdminDirectory({
  actorIsMasterOwner,
  actorRole,
  actorStaffId,
  roles,
  staff,
}: StaffAdminDirectoryProps) {
  return (
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
  const [confirmingTransfer, setConfirmingTransfer] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const usernameChanged = !staffUsernamesMatch(username, member.username);
  const roleChanged = roleCode !== member.role.code;

  async function run(action: () => Promise<{ error: string | null }>) {
    setSaving(true);
    setMessage(null);
    setError(null);
    const result = await action();
    if (result.error) {
      setError(result.error);
    } else {
      setConfirmingDeactivate(false);
      setConfirmingTransfer(false);
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

  async function transferMaster() {
    const formData = new FormData();
    formData.set("staffId", member.id);
    const result = await run(() => transferMasterOwnerAction(formData));
    if (!result.error) {
      setMessage(STAFF_ADMIN_COPY.transferSuccess);
    }
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
                setConfirmingTransfer(false);
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
                setError(null);
              }}
              type="button"
            >
              Transfer Master Owner
            </button>
          )
        ) : null}
      </div>

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
