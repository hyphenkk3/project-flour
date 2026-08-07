"use client";

import { useState } from "react";
import { FormField, FormInput } from "@/components/ui/form";

type SizeDraft = {
  key: string;
  label: string;
  price: string;
};

type CakeSizeFieldsProps = {
  initialSizes?: Array<{ label: string; price: number }>;
};

function createEmptySize(): SizeDraft {
  return {
    key: crypto.randomUUID(),
    label: "",
    price: "",
  };
}

export function CakeSizeFields({ initialSizes }: CakeSizeFieldsProps) {
  const [sizes, setSizes] = useState<SizeDraft[]>(() => {
    if (initialSizes && initialSizes.length > 0) {
      return initialSizes.map((size) => ({
        key: crypto.randomUUID(),
        label: size.label,
        price: String(size.price),
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
            Each size has its own label and price. This is the only cake pricing
            model.
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
            className="border-fog grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_8rem_auto]"
            key={size.key}
          >
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
            <FormField htmlFor={`size_price_${size.key}`} label="Price (RM)">
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
          </li>
        ))}
      </ul>
    </section>
  );
}
