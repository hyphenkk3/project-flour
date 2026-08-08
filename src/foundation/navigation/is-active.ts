import type { WorkspaceNavItem } from "@/foundation/navigation/workspaces";

export function isWorkspaceNavActive(
  item: WorkspaceNavItem,
  currentPath: string,
): boolean {
  if (!item.href) {
    return false;
  }

  // Operations and Whole Cake Calendar both live under /owner — keep them distinct.
  if (item.id === "owner") {
    return (
      currentPath === "/owner" || currentPath.startsWith("/owner/orders")
    );
  }

  if (item.id === "owner_calendar") {
    return (
      currentPath === "/owner/calendar" ||
      currentPath.startsWith("/owner/calendar/")
    );
  }

  if (currentPath === item.href || currentPath.startsWith(`${item.href}/`)) {
    return true;
  }

  return (
    (item.id === "customer_operations" &&
      currentPath.startsWith("/customer-operations")) ||
    (item.id === "library" && currentPath.startsWith("/library"))
  );
}
