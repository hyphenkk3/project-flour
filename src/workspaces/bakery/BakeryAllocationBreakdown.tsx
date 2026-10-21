import type { BakeryAllocationSummary } from "@/engines/bakery/fresh-pick-allocation";

type BakeryAllocationBreakdownProps = {
  summary: BakeryAllocationSummary;
  compact?: boolean;
};

export function BakeryAllocationBreakdown({
  summary,
  compact = false,
}: BakeryAllocationBreakdownProps) {
  if (summary.status !== "verified") {
    return (
      <div
        className="border-status-warning/25 bg-status-warning-soft text-status-warning rounded-xl border px-3 py-2 text-sm leading-relaxed"
        role="alert"
      >
        Fresh Pick allocation needs review. Bakery production actions are blocked
        until the stock links are reconciled.
      </div>
    );
  }

  if (summary.lines.length === 0) return null;

  return (
    <section
      aria-label="Bakery cake production quantities"
      className={compact ? "border-fog rounded-xl border bg-mist/40 p-3" : "border-fog rounded-2xl border bg-white p-5"}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-ink text-xs font-semibold tracking-wide uppercase">
          Cake production quantities
        </h2>
        {summary.fullyCovered ? (
          <span className="text-status-success text-xs font-medium">
            Fully supplied by Fresh Pick
          </span>
        ) : null}
      </div>
      <ul className={compact ? "mt-2 space-y-2" : "mt-3 space-y-3"}>
        {summary.lines.map((line) => (
          <li
            className="text-ink border-fog/70 border-b pb-2 last:border-0 last:pb-0"
            key={line.key}
          >
            <p className="text-sm font-medium">
              {line.cakeName} <span className="text-skyline">· {line.sizeLabel}</span>
            </p>
            <p className="text-skyline mt-1 text-xs leading-relaxed sm:text-sm">
              Ordered {line.orderedQuantity}
              <span aria-hidden="true"> · </span>
              Fresh Pick {line.assignedQuantity}
              <span aria-hidden="true"> · </span>
              To produce {line.remainingQuantity}
            </p>
          </li>
        ))}
      </ul>
      {summary.fullyCovered ? (
        <p className="text-skyline mt-3 text-xs leading-relaxed">
          Use Fresh Pick&apos;s existing physical-stock readiness controls. Bakery
          production cannot be started for these cake quantities.
        </p>
      ) : summary.totalAssignedQuantity > 0 ? (
        <p className="text-signal mt-3 text-xs font-medium">
          Bakery to produce {summary.totalRemainingQuantity} remaining cake
          {summary.totalRemainingQuantity === 1 ? "" : "s"}.
        </p>
      ) : null}
    </section>
  );
}
