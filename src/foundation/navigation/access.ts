import {
  ROLE_NAVIGATION,
  type WorkspaceId,
} from "@/foundation/navigation/workspaces";
import type { RoleCode } from "@/types/staff";

export function canAccessWorkspace(
  role: RoleCode,
  workspace: WorkspaceId,
): boolean {
  return ROLE_NAVIGATION[role].includes(workspace);
}

/**
 * Library read access is separate from Library mutation authority.
 *
 * Bakery may browse the Library, but only Owner + Manager may mutate
 * Library configuration/content.
 */
export function canManageLibrary(role: RoleCode): boolean {
  return role === "owner" || role === "manager";
}

/**
 * Library read access.
 *
 * Bakery may view the Library, but does not receive Library mutation rights.
 */
export function canViewLibrary(role: RoleCode): boolean {
  return (
    role === "owner" ||
    role === "manager" ||
    role === "customer_operations" ||
    role === "bakery"
  );
}

/**
 * Settings access.
 *
 * All authenticated staff may manage their own settings.
 */
export function canAccessSettings(_role: RoleCode): boolean {
  return true;
}

/**
 * Staff account management is restricted to Owner.
 */
export function canManageStaff(role: RoleCode): boolean {
  return role === "owner";
}

/**
 * Pickup-date closure overlay (order availability).
 *
 * Separate from Library configuration authority (`canManageLibrary`).
 * Bakery may close/reopen dates; Customer Operations is view-only.
 */
export function canViewOrderAvailability(role: RoleCode): boolean {
  return (
    role === "owner" ||
    role === "manager" ||
    role === "bakery" ||
    role === "customer_operations"
  );
}

/**
 * Close / reopen pickup dates for new customer preorders.
 *
 * Owner, Manager, and Bakery. Customer Operations must not mutate.
 */
export function canMutateOrderAvailability(role: RoleCode): boolean {
  return role === "owner" || role === "manager" || role === "bakery";
}

export {
  canConfigureWaitingList,
  canManageWaitingList,
  canViewWaitingList,
} from "@/engines/waiting-list/capabilities";
