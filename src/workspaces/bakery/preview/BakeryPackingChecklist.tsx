"use client";

import { useState } from "react";

type BakeryPackingChecklistProps = {
  items: string[];
};

export function BakeryPackingChecklist({ items }: BakeryPackingChecklistProps) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="border-fog rounded-2xl border bg-white p-5">
      <h2 className="text-ink text-xs font-semibold tracking-wide uppercase">
        Packing checklist
      </h2>
      <p className="text-skyline mt-1 text-sm">
        Reminder only — before Mark Ready.
      </p>
      <ul className="mt-3 space-y-2">
        {items.map((item) => {
          const isChecked = Boolean(checked[item]);
          return (
            <li key={item}>
              <label className="text-ink flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
                <input
                  checked={isChecked}
                  className="border-fog text-signal size-4 rounded"
                  onChange={() =>
                    setChecked((current) => ({
                      ...current,
                      [item]: !current[item],
                    }))
                  }
                  type="checkbox"
                />
                <span
                  className={
                    isChecked ? "text-skyline line-through" : undefined
                  }
                >
                  {item}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
