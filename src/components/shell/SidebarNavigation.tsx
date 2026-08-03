import type { WorkspaceNavItem } from "@/foundation/navigation/workspaces";
import { isWorkspaceNavActive } from "@/foundation/navigation/is-active";
import { WorkspaceLink } from "@/components/shell/WorkspaceLink";

type SidebarNavigationProps = {
  items: WorkspaceNavItem[];
  currentPath: string;
};

export function SidebarNavigation({
  items,
  currentPath,
}: SidebarNavigationProps) {
  return (
    <nav aria-label="Workspaces" className="flex flex-col gap-1 px-3 py-4">
      {items.map((item) => (
        <WorkspaceLink
          active={isWorkspaceNavActive(item, currentPath)}
          item={item}
          key={item.id}
        />
      ))}
    </nav>
  );
}
