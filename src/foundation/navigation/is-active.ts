import type { WorkspaceNavItem } from "@/foundation/navigation/workspaces";

export function isWorkspaceNavActive(
  item: WorkspaceNavItem,
  currentPath: string,
): boolean {
  if (!item.href) {
    return false;
  }

  if (currentPath === item.href || currentPath.startsWith(`${item.href}/`)) {
    return true;
  }

  return (
    item.id === "customer_operations" &&
    currentPath.startsWith("/customer-operations")
  );
}
