import type { CSSProperties } from "react";
import type { WorkspaceNavItem } from "@/foundation/navigation/workspaces";
import { isWorkspaceNavActive } from "@/foundation/navigation/is-active";
import { WorkspaceLink } from "@/components/shell/WorkspaceLink";

type MobileNavigationProps = {
  items: WorkspaceNavItem[];
  currentPath: string;
};

const MOBILE_LABELS: Record<string, string> = {
  home: "Home",
  owner: "Ops",
  owner_calendar: "Calendar",
  bakery: "Bakery",
  collection: "Collect",
  library: "Library",
  customer_operations: "Customer",
  management: "Manage",
};

const MOBILE_ITEM_WIDTHS: Record<string, number> = {
  home: 40,
  owner: 39,
  owner_calendar: 49,
  bakery: 39,
  collection: 40,
  library: 39,
  customer_operations: 54,
  management: 43,
};

export function MobileNavigation({
  items,
  currentPath,
}: MobileNavigationProps) {
  const columns = items
    .map((item) => `minmax(0, ${MOBILE_ITEM_WIDTHS[item.id] ?? 40}fr)`)
    .join(" ");

  return (
    <nav
      aria-label="Workspaces"
      className="border-fog fixed inset-x-0 bottom-0 z-40 max-w-full min-w-0 border-t bg-white/95 pb-[max(0.25rem,env(safe-area-inset-bottom))] backdrop-blur-md md:hidden"
    >
      <div
        className="mx-auto grid w-full max-w-lg min-w-0 items-stretch gap-0 px-0"
        style={{ gridTemplateColumns: columns } satisfies CSSProperties}
      >
        {items.map((item) => (
          <WorkspaceLink
            active={isWorkspaceNavActive(item, currentPath)}
            compact
            item={item}
            key={item.id}
            mobileLabel={MOBILE_LABELS[item.id] ?? item.label}
            mobileNavigation
          />
        ))}
      </div>
    </nav>
  );
}
