"use client";

import { useState } from "react";
import { FormField, FormInput, FormSelect } from "@/components/ui/form";
import type { LibraryCakeSizePrice } from "@/types/library-cake";
import { CakeSizePriceSchedule } from "@/workspaces/library/cakes/CakeSizePriceSchedule";

/** Library UI choices only. The database still accepts any integer >= 1. */
const PREORDER_DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 7] as const;

type SizeDraft = {
  key: string;
  id: string | null;
  label: string;
  price: string;
  preorderDays: string;
};

function preorderOptionLabel(days: number): string {
  return days === 1 ? "1 day" : `${days} days`;
}

function preorderSelectValues(current: string): number[] {
  const parsed = Number.parseInt(current, 10);
  if (
    Number.isInteger(parsed) &&
    parsed >= 1 &&
    !PREORDER_DAY_OPTIONS.some((days) => days === parsed)
  ) {
    return [...PREORDER_DAY_OPTIONS, parsed].sort((a, b) => a - b);
  }
  return [...PREORDER_DAY_OPTIONS];
}

type CakeSizeFieldsProps = {
  cakeId?: string;
  initialSizes?: Array<{
    id?: string;
    label: string;
    price: number;
    preorderDays?: number;
  }>;
  schedules?: LibraryCakeSizePrice[];
};

function createEmptySize(): SizeDraft {
  return {
    key: crypto.randomUUID(),
    id: null,
    label: "",
    price: "",
    preorderDays: "2",
  };
}

export function CakeSizeFields({
  cakeId,
  initialSizes,
  schedules = [],
}: CakeSizeFieldsProps) {
  const [sizes, setSizes] = useState<SizeDraft[]>(() => {
    if (initialSizes && initialSizes.length > 0) {
      return initialSizes.map((size) => ({
        key: size.id ?? crypto.randomUUID(),
        id: size.id ?? null,
        label: size.label,
        price: String(size.price),
        preorderDays: String(size.preorderDays ?? 2),
      }));
    }
    return [createEmptySize()];
  });

  return (
    <section className="border-fog space-y-4 rounded-xl border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-ink text-sm font-semibold tracking-wide uppercase">
            Sizes
          </h2>
          <p className="text-skyline mt-1 text-sm">
            Each size has its own label, current price, and preorder days.
            Preorder days are the minimum calendar days before collection (DAY 0
            is today in Malaysia). Existing size identities are kept when you
            edit a cake. Scheduled future prices do not change the current
            price.
          </p>
        </div>
        <button
          className="border-fog text-ink hover:bg-mist inline-flex min-h-10 shrink-0 items-center rounded-lg border px-3 text-sm font-medium"
          onClick={() => setSizes((current) => [...current, createEmptySize()])}
          type="button"
        >
          Add size
        </button>
      </div>

      <ul className="space-y-3">
        {sizes.map((size, index) => (
          <li
            className="border-fog space-y-3 rounded-lg border p-3"
            key={size.key}
          >
            <div className="grid gap-3 sm:grid-cols-[1fr_8rem_9.5rem_auto]">
              <input name="size_id" type="hidden" value={size.id ?? ""} />
              <FormField htmlFor={`size_label_${size.key}`} label="Size">
                <FormInput
                  id={`size_label_${size.key}`}
                  name="size_label"
                  onChange={(event) => {
                    const value = event.target.value;
                    setSizes((current) =>
                      current.map((row) =>
                        row.key === size.key ? { ...row, label: value } : row,
                      ),
                    );
                  }}
                  placeholder={index === 0 ? '6"' : '4"'}
                  value={size.label}
                />
              </FormField>
              <FormField
                htmlFor={`size_price_${size.key}`}
                label="Current price (RM)"
              >
                <FormInput
                  id={`size_price_${size.key}`}
                  min={0}
                  name="size_price"
                  onChange={(event) => {
                    const value = event.target.value;
                    setSizes((current) =>
                      current.map((row) =>
                        row.key === size.key ? { ...row, price: value } : row,
                      ),
                    );
                  }}
                  placeholder={index === 0 ? "125" : "78"}
                  step="0.01"
                  type="number"
                  value={size.price}
                />
              </FormField>
              <FormField
                htmlFor={`size_preorder_days_${size.key}`}
                label="Preorder"
              >
                <FormSelect
                  id={`size_preorder_days_${size.key}`}
                  name="size_preorder_days"
                  onChange={(event) => {
                    const value = event.target.value;
                    setSizes((current) =>
                      current.map((row) =>
                        row.key === size.key
                          ? { ...row, preorderDays: value }
                          : row,
                      ),
                    );
                  }}
                  value={size.preorderDays}
                >
                  {preorderSelectValues(size.preorderDays).map((days) => (
                    <option key={days} value={days}>
                      {preorderOptionLabel(days)}
                    </option>
                  ))}
                </FormSelect>
              </FormField>
              <div className="flex items-end">
                <button
                  className="text-skyline hover:text-ink inline-flex min-h-12 items-center px-2 text-sm font-medium disabled:opacity-40"
                  disabled={sizes.length <= 1}
                  onClick={() =>
                    setSizes((current) =>
                      current.filter((row) => row.key !== size.key),
                    )
                  }
                  type="button"
                >
                  Remove
                </button>
              </div>
            </div>
            {cakeId && size.id ? (
              <CakeSizePriceSchedule
                cakeId={cakeId}
                cakeSizeId={size.id}
                currentPrice={Number(size.price) || 0}
                schedules={schedules.filter(
                  (row) => row.cakeSizeId === size.id,
                )}
              />
            ) : cakeId ? (
              <p className="text-skyline text-xs">
                Save this cake first to schedule a future price for a new size.
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
