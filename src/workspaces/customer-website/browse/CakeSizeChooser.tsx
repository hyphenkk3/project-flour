"use client";

import { useState } from "react";
import {
  formatCakePrice,
  type CakeSizeOption,
} from "@/workspaces/customer-website/browse/cake-detail-demo";

type CakeSizeChooserProps = {
  sizes: CakeSizeOption[];
  selectedId?: string;
  onSelect?: (id: string) => void;
};

export function CakeSizeChooser({
  sizes,
  selectedId,
  onSelect,
}: CakeSizeChooserProps) {
  const [internalId, setInternalId] = useState(sizes[0]?.id ?? "");
  const activeId = selectedId ?? internalId;
  const selected = sizes.find((size) => size.id === activeId) ?? sizes[0];

  if (!selected) {
    return null;
  }

  function select(id: string) {
    if (onSelect) {
      onSelect(id);
      return;
    }
    setInternalId(id);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-ink text-sm font-semibold tracking-wide uppercase">
            Available sizes
          </h2>
          <p className="text-skyline mt-1 text-sm">
            Choose the size that fits your celebration.
          </p>
        </div>
        <p className="font-display text-ink text-2xl tracking-tight">
          {formatCakePrice(selected.priceRm)}
        </p>
      </div>

      <ul className="space-y-3" role="listbox" aria-label="Cake sizes">
        {sizes.map((size) => {
          const isSelected = size.id === selected.id;
          return (
            <li key={size.id}>
              <button
                aria-selected={isSelected}
                className={`flex min-h-14 w-full items-center justify-between gap-4 rounded-2xl border px-4 py-3 text-left transition ${
                  isSelected
                    ? "border-signal bg-white"
                    : "border-fog hover:border-signal/50 bg-white"
                }`}
                onClick={() => select(size.id)}
                role="option"
                type="button"
              >
                <span>
                  <span className="text-ink block text-sm font-medium">
                    {size.label}
                  </span>
                  <span className="text-skyline mt-0.5 block text-sm">
                    {size.serves}
                  </span>
                </span>
                <span className="text-ink text-sm font-medium">
                  {formatCakePrice(size.priceRm)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
