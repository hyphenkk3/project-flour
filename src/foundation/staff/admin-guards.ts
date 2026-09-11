import { canManageStaff } from "@/foundation/navigation/access";
import type { RoleCode } from "@/types/staff";

export const STAFF_ADMIN_COPY = {
  unauthorized: "You don't have permission to manage staff.",
  notFound: "Staff member not found.",
  cannotDeactivateSelf: "Cannot deactivate yourself.",
  cannotDemoteSelf: "Cannot remove your own Owner access.",
  cannotEditOwnUsername: "Change your own username in Settings.",
  lastOwner: "Cannot remove the last active Owner.",
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

export function staffAdminDeactivateError(input: {
  actorStaffId: string;
  targetStaffId: string;
  targetIsActiveOwner: boolean;
  activeOwnerCount: number;
}): string | null {
  if (input.actorStaffId === input.targetStaffId) {
    return STAFF_ADMIN_COPY.cannotDeactivateSelf;
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
}): string | null {
  if (input.actorStaffId === input.targetStaffId && !input.nextRoleIsOwner) {
    return STAFF_ADMIN_COPY.cannotDemoteSelf;
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
}): string | null {
  if (input.actorStaffId === input.targetStaffId) {
    return STAFF_ADMIN_COPY.cannotEditOwnUsername;
  }
  return null;
}
