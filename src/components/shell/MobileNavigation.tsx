import type { WorkspaceNavItem } from "@/foundation/navigation/workspaces";
import { isWorkspaceNavActive } from "@/foundation/navigation/is-active";
import { WorkspaceLink } from "@/components/shell/WorkspaceLink";

type MobileNavigationProps = {
  items: WorkspaceNavItem[];
  currentPath: string;
};

export function MobileNavigation({
  items,
  currentPath,
}: MobileNavigationProps) {
  return (
    <nav
      aria-label="Workspaces"
      className="border-fog fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 backdrop-blur-md md:hidden"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-between gap-0 px-1 pb-[env(safe-area-inset-bottom)]">
        {items.map((item) => (
          <WorkspaceLink
            active={isWorkspaceNavActive(item, currentPath)}
            compact
            item={item}
            key={item.id}
          />
        ))}
      </div>
    </nav>
  );
}
