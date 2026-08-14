import Link from "next/link";

type BakeryWorkspaceNavProps = {
  active: "production" | "extra";
  /** lifecycle === "proposed" count; omit or 0 → no tab count. */
  proposedCount?: number;
};

export function BakeryWorkspaceNav({
  active,
  proposedCount = 0,
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
      <Link
        className={active === "production" ? on : idle}
        href="/bakery"
      >
        Production
      </Link>
      <Link
        className={active === "extra" ? on : idle}
        href="/bakery/extra"
      >
        {extraLabel}
      </Link>
    </nav>
  );
}
