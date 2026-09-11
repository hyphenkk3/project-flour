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
  targetIsMasterOwner?: boolean;
}): string | null {
  if (input.actorStaffId === input.targetStaffId) {
    return STAFF_ADMIN_COPY.cannotDeactivateSelf;
  }
  if (input.targetIsMasterOwner) {
    return STAFF_ADMIN_COPY.cannotDeactivateMaster;
  }
  if (input.targetIsActiveOwner && input.activeOwnerCount <= 1) {
    return STAFF_ADMIN_COPY.lastOwner;
  }
  return null;
}

export function staffAdminRoleChangeError(input: {
  actorStaffId: string;
  targetStaffId: string;
  targetIsActiveOwner: boolean;
  nextRoleIsOwner: boolean;
  activeOwnerCount: number;
  actorIsMasterOwner?: boolean;
  targetIsMasterOwner?: boolean;
  targetRoleIsOwner?: boolean;
}): string | null {
  const actorIsMasterOwner = input.actorIsMasterOwner ?? false;
  const targetIsMasterOwner = input.targetIsMasterOwner ?? false;
  const targetRoleIsOwner = input.targetRoleIsOwner ?? input.targetIsActiveOwner;

  if (input.actorStaffId === input.targetStaffId && !input.nextRoleIsOwner) {
    return STAFF_ADMIN_COPY.cannotDemoteSelf;
  }
  if (targetIsMasterOwner && !input.nextRoleIsOwner) {
    return STAFF_ADMIN_COPY.cannotDemoteMaster;
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
  targetIsMasterOwner?: boolean;
}): string | null {
  if (input.actorStaffId === input.targetStaffId) {
    return STAFF_ADMIN_COPY.cannotEditOwnUsername;
  }
  if (input.targetIsMasterOwner) {
    return STAFF_ADMIN_COPY.cannotChangeMaster;
  }
  return null;
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
