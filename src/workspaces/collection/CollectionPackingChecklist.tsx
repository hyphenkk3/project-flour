"use client";

import { useMemo, useState } from "react";
import type { CollectionPackingReminderItem } from "@/workspaces/collection/types";

type CollectionPackingChecklistProps = {
  items: CollectionPackingReminderItem[];
};

/**
 * Local reminder checklist only — refresh clears checks.
 * Does not persist Arrived / Verified / packing state.
 */
export function CollectionPackingChecklist({
  items,
}: CollectionPackingChecklistProps) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const allChecked = useMemo(
    () => items.length > 0 && items.every((item) => Boolean(checked[item.key])),
    [checked, items],
  );

  if (items.length === 0) {
    return null;
  }

  function handleCheckAll() {
    setChecked(Object.fromEntries(items.map((item) => [item.key, true])));
  }

  function handleClearAll() {
    setChecked({});
  }

  return (
    <section className="border-fog rounded-2xl border bg-white p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-ink text-xs font-semibold tracking-wide uppercase">
            Packing reminder
          </h2>
          <p className="text-skyline mt-1 text-sm">
            Reminder only — checks are not saved. Refresh clears them. Does not
            gate Mark Collected.
          </p>
        </div>
        <button
          className="text-signal hover:text-ink -mr-2 min-h-11 shrink-0 px-2 text-sm font-medium transition"
          onClick={allChecked ? handleClearAll : handleCheckAll}
          type="button"
        >
          {allChecked ? "Clear all" : "Check all"}
        </button>
      </div>
      <ul className="mt-3 space-y-2">
        {items.map((item) => {
          const isChecked = Boolean(checked[item.key]);
          return (
            <li key={item.key}>
              <label className="text-ink flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
                <input
                  checked={isChecked}
                  className="border-fog text-signal size-4 rounded"
                  onChange={() =>
                    setChecked((current) => ({
                      ...current,
                      [item.key]: !isChecked,
                    }))
                  }
                  type="checkbox"
                />
                <span className={isChecked ? "text-skyline line-through" : ""}>
                  {item.label}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
