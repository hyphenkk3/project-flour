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
