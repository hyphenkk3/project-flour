"use client";

import { useState, useTransition } from "react";
import { formatCakeSizePriceSchedulePeriod } from "@/engines/orders/cake-size-price";
import { FormError, FormField, FormInput } from "@/components/ui/form";
import type { LibraryCakeSizePrice } from "@/types/library-cake";
import {
  createCakeSizePriceAction,
  deleteCakeSizePriceAction,
  updateCakeSizePriceAction,
} from "@/workspaces/library/cakes/price-schedule-actions";
import { formatLibraryMoney } from "@/workspaces/library/labels";

type CakeSizePriceScheduleProps = {
  cakeId: string;
  cakeSizeId: string;
  currentPrice: number;
  schedules: LibraryCakeSizePrice[];
};

export function CakeSizePriceSchedule({
  cakeId,
  cakeSizeId,
  currentPrice,
  schedules,
}: CakeSizePriceScheduleProps) {
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addKey, setAddKey] = useState(0);
  const [pending, startTransition] = useTransition();

  return (
    <div className="border-fog bg-mist/40 space-y-3 rounded-md border p-3 sm:col-span-full">
      <div>
        <p className="text-ink text-xs font-semibold tracking-wide uppercase">
          Current price
        </p>
        <p className="text-ink mt-1 text-sm font-medium tabular-nums">
          {formatLibraryMoney(currentPrice)}
        </p>
        <p className="text-skyline mt-1 text-xs leading-relaxed">
          Browse and cake detail keep using this current price. A future
          schedule does not change it.
        </p>
      </div>

      <div>
        <p className="text-ink text-xs font-semibold tracking-wide uppercase">
          Scheduled prices
        </p>
        {schedules.length === 0 ? (
          <p className="text-skyline mt-1 text-sm">No scheduled prices yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {schedules.map((row) =>
              editingId === row.id ? (
                <li key={row.id}>
                  <ScheduleFields
                    disabled={pending}
                    fieldPrefix={`${cakeSizeId}-${row.id}`}
                    initialFrom={row.effectiveFrom}
                    initialPrice={String(row.price)}
                    initialTo={row.effectiveTo ?? ""}
                    onCancel={() => {
                      setEditingId(null);
                      setError(null);
                    }}
                    onSubmit={(formData) => {
                      formData.set("cake_size_id", cakeSizeId);
                      setError(null);
                      startTransition(() => {
                        void updateCakeSizePriceAction(
                          cakeId,
                          row.id,
                          { error: null },
                          formData,
                        ).then((result) => {
                          if (result.error) {
                            setError(result.error);
                            return;
                          }
                          setEditingId(null);
                        });
                      });
                    }}
                    submitLabel="Save schedule"
                  />
                </li>
              ) : (
                <li
                  className="flex flex-wrap items-center justify-between gap-2 text-sm"
                  key={row.id}
                >
                  <span className="text-ink">
                    {formatCakeSizePriceSchedulePeriod({
                      effectiveFrom: row.effectiveFrom,
                      effectiveTo: row.effectiveTo,
                    })}{" "}
                    — {formatLibraryMoney(row.price)}
                  </span>
                  <span className="flex gap-2">
                    <button
                      className="text-skyline hover:text-ink text-sm font-medium"
                      onClick={() => {
                        setEditingId(row.id);
                        setError(null);
                      }}
                      type="button"
                    >
                      Edit
                    </button>
                    <button
                      className="text-skyline hover:text-ink text-sm font-medium disabled:opacity-40"
                      disabled={pending}
                      onClick={() => {
                        setError(null);
                        startTransition(() => {
                          void deleteCakeSizePriceAction(cakeId, row.id).then(
                            (result) => {
                              if (result.error) setError(result.error);
                            },
                          );
                        });
                      }}
                      type="button"
                    >
                      Delete
                    </button>
                  </span>
                </li>
              ),
            )}
          </ul>
        )}
      </div>

      <div>
        <p className="text-ink text-xs font-semibold tracking-wide uppercase">
          Add a scheduled price
        </p>
        <ScheduleFields
          disabled={pending}
          fieldPrefix={`${cakeSizeId}-new-${addKey}`}
          key={addKey}
          onSubmit={(formData) => {
            formData.set("cake_size_id", cakeSizeId);
            setError(null);
            startTransition(() => {
              void createCakeSizePriceAction(
                cakeId,
                { error: null },
                formData,
              ).then((result) => {
                if (result.error) {
                  setError(result.error);
                  return;
                }
                setAddKey((current) => current + 1);
              });
            });
          }}
          submitLabel="Add schedule"
        />
      </div>
      {error ? <FormError message={error} /> : null}
    </div>
  );
}

type ScheduleFieldsProps = {
  fieldPrefix: string;
  submitLabel: string;
  disabled?: boolean;
  initialPrice?: string;
  initialFrom?: string;
  initialTo?: string;
  onSubmit: (formData: FormData) => void;
  onCancel?: () => void;
};

function ScheduleFields({
  fieldPrefix,
  submitLabel,
  disabled = false,
  initialPrice = "",
  initialFrom = "",
  initialTo = "",
  onSubmit,
  onCancel,
}: ScheduleFieldsProps) {
  const [price, setPrice] = useState(initialPrice);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);

  function handleSubmit() {
    const formData = new FormData();
    formData.set("schedule_price", price);
    formData.set("effective_from", from);
    formData.set("effective_to", to);
    onSubmit(formData);
  }

  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-4">
      <FormField htmlFor={`schedule_price_${fieldPrefix}`} label="Price (RM)">
        <FormInput
          id={`schedule_price_${fieldPrefix}`}
          min={0}
          name={`schedule_price_${fieldPrefix}`}
          onChange={(event) => setPrice(event.target.value)}
          placeholder="130"
          step="0.01"
          type="number"
          value={price}
        />
      </FormField>
      <FormField
        htmlFor={`effective_from_${fieldPrefix}`}
        label="Effective from"
      >
        <FormInput
          id={`effective_from_${fieldPrefix}`}
          name={`effective_from_${fieldPrefix}`}
          onChange={(event) => setFrom(event.target.value)}
          type="date"
          value={from}
        />
      </FormField>
      <FormField htmlFor={`effective_to_${fieldPrefix}`} label="Effective to">
        <FormInput
          id={`effective_to_${fieldPrefix}`}
          name={`effective_to_${fieldPrefix}`}
          onChange={(event) => setTo(event.target.value)}
          type="date"
          value={to}
        />
      </FormField>
      <div className="flex items-end gap-2">
        <button
          className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 items-center rounded-lg px-4 text-sm font-medium disabled:opacity-60"
          disabled={disabled}
          onClick={handleSubmit}
          type="button"
        >
          {submitLabel}
        </button>
        {onCancel ? (
          <button
            className="text-skyline hover:text-ink inline-flex min-h-12 items-center px-2 text-sm font-medium"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}
