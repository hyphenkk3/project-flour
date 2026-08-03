import {
  getNavigationForRole,
  type WorkspaceNavItem,
} from "@/foundation/navigation/workspaces";
import type { RoleCode } from "@/types/staff";

export function resolveStaffNavigation(roleCode: RoleCode): WorkspaceNavItem[] {
  return getNavigationForRole(roleCode);
}

export type {
  WorkspaceNavItem,
  WorkspaceId,
} from "@/foundation/navigation/workspaces";
