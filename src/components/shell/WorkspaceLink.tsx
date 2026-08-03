import Link from "next/link";
import type { WorkspaceNavItem } from "@/foundation/navigation/workspaces";

type WorkspaceLinkProps = {
  item: WorkspaceNavItem;
  active?: boolean;
  compact?: boolean;
};

export function WorkspaceLink({
  item,
  active = false,
  compact = false,
}: WorkspaceLinkProps) {
  const baseClass = compact
    ? "flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-center text-[11px] leading-tight"
    : "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition";

  if (!item.available || !item.href) {
    return (
      <span
        aria-disabled="true"
        className={
          compact
            ? `${baseClass} text-skyline/40`
            : `${baseClass} text-skyline/45 cursor-not-allowed`
        }
        title="Coming later"
      >
        <span className={compact ? "line-clamp-2 font-medium" : "font-medium"}>
          {item.label}
        </span>
      </span>
    );
  }

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={
        compact
          ? `${baseClass} ${
              active
                ? "text-signal border-t-signal border-t-2 font-semibold"
                : "text-skyline border-t-2 border-t-transparent font-medium"
            }`
          : `${baseClass} ${
              active
                ? "border-signal text-ink border-l-[3px] bg-white pl-2.5 font-semibold shadow-sm"
                : "text-skyline hover:text-ink border-l-[3px] border-l-transparent hover:bg-white/70"
            }`
      }
      href={item.href}
    >
      <span className={compact ? "line-clamp-2" : undefined}>{item.label}</span>
    </Link>
  );
}
