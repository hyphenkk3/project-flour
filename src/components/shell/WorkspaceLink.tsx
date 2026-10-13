import Link from "next/link";
import type { WorkspaceNavItem } from "@/foundation/navigation/workspaces";

type WorkspaceLinkProps = {
  item: WorkspaceNavItem;
  active?: boolean;
  compact?: boolean;
  mobileNavigation?: boolean;
  mobileLabel?: string;
};

export function WorkspaceLink({
  item,
  active = false,
  compact = false,
  mobileNavigation = false,
  mobileLabel,
}: WorkspaceLinkProps) {
  const baseClass = compact
    ? mobileNavigation
      ? "relative flex min-h-11 w-full min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 py-1 text-center text-[10px] leading-none touch-manipulation after:pointer-events-none after:absolute after:right-0 after:top-1/2 after:h-3 after:w-px after:-translate-y-1/2 after:bg-fog/70 after:content-[''] last:after:hidden"
      : "flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-center text-[11px] leading-tight"
    : "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition";
  const label = mobileNavigation ? (mobileLabel ?? item.label) : item.label;

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
        <span
          className={
            mobileNavigation
              ? "font-medium whitespace-nowrap"
              : compact
                ? "line-clamp-2 font-medium"
                : "font-medium"
          }
        >
          {label}
        </span>
      </span>
    );
  }

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={
        compact
          ? mobileNavigation
            ? `${baseClass} ${
                active
                  ? "text-signal font-semibold"
                  : "text-skyline font-medium"
              }`
            : `${baseClass} ${
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
      scroll={item.href.startsWith("/owner/calendar") ? false : undefined}
    >
      <span
        className={
          mobileNavigation
            ? `py-1 whitespace-nowrap ${
                active ? "bg-signal/10 text-signal rounded-md" : ""
              }`
            : compact
              ? "line-clamp-2"
              : undefined
        }
      >
        {label}
      </span>
    </Link>
  );
}
