import { canManageStaff } from "@/foundation/navigation/access";
import type { RoleCode } from "@/types/staff";

export const STAFF_ADMIN_COPY = {
  unauthorized: "You don't have permission to manage staff.",
  notFound: "Staff member not found.",
  cannotDeactivateSelf: "Cannot deactivate yourself.",
  cannotDemoteSelf: "Cannot remove your own Owner access.",
  cannotEditOwnUsername: "Change your own username in Settings.",
  lastOwner: "Cannot remove the last active Owner.",
  cannotCreateOwner: "Only the Master Owner can create an Owner.",
  cannotPromoteToOwner: "Only the Master Owner can promote staff to Owner.",
  cannotDemoteMaster: "The Master Owner account cannot change role.",
  cannotDeactivateMaster: "The Master Owner account cannot be deactivated.",
  cannotChangeMaster: "The Master Owner account cannot be changed here.",
  cannotManageOwner: "Managers cannot change Owner accounts.",
  cannotTransfer: "Only the Master Owner can transfer Master Owner status.",
  cannotTransferToSelf: "Cannot transfer Master Owner to yourself.",
  transferTargetMustBeActiveOwner: "Transfer target must be an active Owner.",
  transferSuccess: "Master Owner transferred.",
  invalidRole: "Invalid role.",
  invalidEmail: "Please enter a valid email address.",
  emptyDisplayName: "Please enter a display name.",
  emptyPassword: "Please enter an initial password.",
  passwordMismatch: "New password and confirmation do not match.",
  emailUnavailable: "That email couldn't be used.",
  createFailed: "Unable to create staff account.",
  updateFailed: "That staff account couldn't be updated. Please try again.",
  createSuccess: "Staff account created.",
  usernameSuccess: "Username updated successfully.",
  roleSuccess: "Role updated successfully.",
  deactivated: "Staff account deactivated.",
  reactivated: "Staff account reactivated.",
  cannotResetOwnPassword: "Change your own password in Settings.",
  resetConfirm:
    "Their current password will stop working. They will receive a temporary password and must choose a new password after signing in.",
  resetSuccess: "Password reset successfully.",
  resetHandoff:
    "Give this temporary password to the staff member. They will be required to create a new password after signing in.",
  resetFailed: "That password couldn't be reset. Please try again.",
  resetFlagFailed:
    "Unable to prepare the account for a password reset. Please try again.",
  resetUncertain:
    "The password reset could not be confirmed. The staff member may be required to create a new password before continuing.",
  resetSessionWarning:
    "The temporary password is ready, but existing sessions could not be signed out. Ask the staff member to sign in with the temporary password.",
} as const;

export const STAFF_ROLE_CODES: readonly RoleCode[] = [
  "owner",
  "manager",
  "customer_operations",
  "bakery",
  "collection",
];

export function isStaffRoleCode(value: string): value is RoleCode {
  return (STAFF_ROLE_CODES as readonly string[]).includes(value);
}

export function staffAdminActorError(role: RoleCode): string | null {
  if (!canManageStaff(role)) return STAFF_ADMIN_COPY.unauthorized;
  return null;
}

export function canManageOwnerStaff(role: RoleCode): boolean {
  return role === "owner";
}

/**
 * Only Owner (including Master Owner) may mutate Owner accounts.
 *
 * actorRole is required. A missing or non-Owner actorRole is fail-closed:
 * Owner targets are rejected instead of silently allowed.
 */
export function staffAdminOwnerMutationError(input: {
  actorRole: RoleCode;
  targetRoleIsOwner: boolean;
  targetIsMasterOwner?: boolean;
}): string | null {
  if (canManageOwnerStaff(input.actorRole)) {
    return null;
  }
  if (input.targetIsMasterOwner) {
    return STAFF_ADMIN_COPY.cannotChangeMaster;
  }
  // Fail closed: missing/invalid targetRoleIsOwner must not allow Owner mutation.
  if (input.targetRoleIsOwner !== false) {
    return STAFF_ADMIN_COPY.cannotManageOwner;
  }
  return null;
}

export function staffAdminCreateRoleError(input: {
  actorIsMasterOwner: boolean;
  roleCode: RoleCode;
}): string | null {
  if (input.roleCode === "owner" && !input.actorIsMasterOwner) {
    return STAFF_ADMIN_COPY.cannotCreateOwner;
  }
  return null;
}

export function staffAdminDeactivateError(input: {
  actorStaffId: string;
  targetStaffId: string;
  targetIsActiveOwner: boolean;
  activeOwnerCount: number;
  actorRole: RoleCode;
  targetRoleIsOwner: boolean;
  targetIsMasterOwner?: boolean;
}): string | null {
  if (input.actorStaffId === input.targetStaffId) {
    return STAFF_ADMIN_COPY.cannotDeactivateSelf;
  }
  if (input.targetIsMasterOwner) {
    return STAFF_ADMIN_COPY.cannotDeactivateMaster;
  }
  const ownerMutationError = staffAdminOwnerMutationError({
    actorRole: input.actorRole,
    targetRoleIsOwner: input.targetRoleIsOwner,
    targetIsMasterOwner: input.targetIsMasterOwner,
  });
  if (ownerMutationError) {
    return ownerMutationError;
  }
  if (input.targetIsActiveOwner && input.activeOwnerCount <= 1) {
    return STAFF_ADMIN_COPY.lastOwner;
  }
  return null;
}

export function staffAdminActivateError(input: {
  actorRole: RoleCode;
  targetRoleIsOwner: boolean;
  targetIsMasterOwner?: boolean;
}): string | null {
  return staffAdminOwnerMutationError(input);
}

export function staffAdminRoleChangeError(input: {
  actorStaffId: string;
  targetStaffId: string;
  targetIsActiveOwner: boolean;
  nextRoleIsOwner: boolean;
  activeOwnerCount: number;
  actorRole: RoleCode;
  targetRoleIsOwner: boolean;
  actorIsMasterOwner?: boolean;
  targetIsMasterOwner?: boolean;
}): string | null {
  const actorIsMasterOwner = input.actorIsMasterOwner ?? false;
  const targetIsMasterOwner = input.targetIsMasterOwner ?? false;
  const targetRoleIsOwner = input.targetRoleIsOwner;

  if (input.actorStaffId === input.targetStaffId && !input.nextRoleIsOwner) {
    return STAFF_ADMIN_COPY.cannotDemoteSelf;
  }
  if (targetIsMasterOwner && !input.nextRoleIsOwner) {
    return STAFF_ADMIN_COPY.cannotDemoteMaster;
  }
  const ownerMutationError = staffAdminOwnerMutationError({
    actorRole: input.actorRole,
    targetRoleIsOwner,
    targetIsMasterOwner,
  });
  if (ownerMutationError) {
    return ownerMutationError;
  }
  if (input.nextRoleIsOwner && !actorIsMasterOwner && !targetRoleIsOwner) {
    return STAFF_ADMIN_COPY.cannotPromoteToOwner;
  }
  if (
    input.targetIsActiveOwner &&
    !input.nextRoleIsOwner &&
    input.activeOwnerCount <= 1
  ) {
    return STAFF_ADMIN_COPY.lastOwner;
  }
  return null;
}

export function staffAdminUsernameChangeError(input: {
  actorStaffId: string;
  targetStaffId: string;
  actorRole: RoleCode;
  targetRoleIsOwner: boolean;
  targetIsMasterOwner?: boolean;
}): string | null {
  if (input.actorStaffId === input.targetStaffId) {
    return STAFF_ADMIN_COPY.cannotEditOwnUsername;
  }
  if (input.targetIsMasterOwner) {
    return STAFF_ADMIN_COPY.cannotChangeMaster;
  }
  return staffAdminOwnerMutationError({
    actorRole: input.actorRole,
    targetRoleIsOwner: input.targetRoleIsOwner,
    targetIsMasterOwner: input.targetIsMasterOwner,
  });
}

export function staffAdminPasswordResetError(input: {
  actorStaffId: string;
  targetStaffId: string;
  actorRole: RoleCode;
  targetRoleIsOwner: boolean;
  targetIsMasterOwner?: boolean;
}): string | null {
  if (!canManageStaff(input.actorRole)) {
    return STAFF_ADMIN_COPY.unauthorized;
  }
  if (input.actorStaffId === input.targetStaffId) {
    return STAFF_ADMIN_COPY.cannotResetOwnPassword;
  }
  if (input.targetIsMasterOwner) {
    return STAFF_ADMIN_COPY.cannotChangeMaster;
  }
  return staffAdminOwnerMutationError({
    actorRole: input.actorRole,
    targetRoleIsOwner: input.targetRoleIsOwner,
    targetIsMasterOwner: input.targetIsMasterOwner,
  });
}

export function staffAdminTransferError(input: {
  actorStaffId: string;
  targetStaffId: string;
  actorIsMasterOwner: boolean;
  targetIsActive: boolean;
  targetIsOwner: boolean;
}): string | null {
  if (!input.actorIsMasterOwner) {
    return STAFF_ADMIN_COPY.cannotTransfer;
  }
  if (input.actorStaffId === input.targetStaffId) {
    return STAFF_ADMIN_COPY.cannotTransferToSelf;
  }
  if (!input.targetIsActive || !input.targetIsOwner) {
    return STAFF_ADMIN_COPY.transferTargetMustBeActiveOwner;
  }
  return null;
}
