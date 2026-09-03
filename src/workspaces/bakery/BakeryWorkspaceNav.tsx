import Link from "next/link";

type BakeryWorkspaceNavProps = {
  active: "production" | "extra" | "availability";
  /** lifecycle === "proposed" count; omit or 0 → no tab count. */
  proposedCount?: number;
  /** Production and EXTRA. Customer Operations may view Availability only. */
  showWorkspaceLinks?: boolean;
};

export function BakeryWorkspaceNav({
  active,
  proposedCount = 0,
  showWorkspaceLinks = true,
}: BakeryWorkspaceNavProps) {
  const base =
    "inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-medium transition";
  const idle = `${base} text-skyline hover:text-ink hover:bg-mist`;
  const on = `${base} bg-ink text-mist`;
  const extraLabel =
    proposedCount > 0 ? `EXTRA · ${proposedCount}` : "EXTRA";

  return (
    <nav
      aria-label="Bakery sections"
      className="border-fog flex gap-1 border-b pb-3"
    >
      {showWorkspaceLinks ? (
        <Link
          className={active === "production" ? on : idle}
          href="/bakery"
        >
          Production
        </Link>
      ) : null}
      <Link
        className={active === "availability" ? on : idle}
        href="/bakery/availability"
      >
        Availability
      </Link>
      {showWorkspaceLinks ? (
        <Link
          className={active === "extra" ? on : idle}
          href="/bakery/extra"
        >
          {extraLabel}
        </Link>
      ) : null}
    </nav>
  );
}
