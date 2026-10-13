import Link from "next/link";
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
        <div key={item.id}>
          <WorkspaceLink
            active={isWorkspaceNavActive(item, currentPath)}
            item={item}
          />
          {item.children?.length ? (
            <div className="border-fog mt-1 ml-6 flex flex-col gap-1 border-l pl-3">
              {item.children.map((child) => {
                const active =
                  currentPath === child.href ||
                  currentPath.startsWith(`${child.href}/`);
                return (
                  <Link
                    aria-current={active ? "page" : undefined}
                    className={`rounded-md px-3 py-2 text-sm transition ${
                      active
                        ? "text-ink bg-white font-semibold"
                        : "text-skyline hover:text-ink hover:bg-white/70"
                    }`}
                    href={child.href}
                    key={child.href}
                  >
                    {child.label}
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>
      ))}
    </nav>
  );
}
