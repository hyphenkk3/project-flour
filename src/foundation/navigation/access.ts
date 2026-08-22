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
