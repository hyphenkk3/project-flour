"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  FormActions,
  FormCheckbox,
  FormError,
  FormField,
  FormInput,
  FormSelect,
  FormSubmitButton,
  FormTextarea,
} from "@/components/ui/form";
import { PickupSlotFields } from "@/components/ui/PickupSlotFields";
import type { StorefrontCake } from "@/types/storefront";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import { calculateOrderTotal } from "@/engines/orders/totals";
import {
  submitGuestPreorderAction,
  type CheckoutState,
} from "@/workspaces/storefront/checkout/actions";
import {
  emptyPreorderFields,
  readPreorderDraft,
  writePreorderDraft,
  type PreorderDraft,
  type PreorderDraftFields,
  type PreorderDraftItem,
} from "@/workspaces/storefront/checkout/preorder-draft";

const initialState: CheckoutState = { error: null };

type GuestCheckoutFormProps = {
  cakes: StorefrontCake[];
};

function persistDraft(
  items: PreorderDraftItem[],
  fields: PreorderDraftFields,
): void {
  const draft: PreorderDraft = {
    ...fields,
    items,
  };
  writePreorderDraft(draft);
}

export function GuestCheckoutForm({ cakes }: GuestCheckoutFormProps) {
  const [state, formAction, pending] = useActionState(
    submitGuestPreorderAction,
    initialState,
  );

  const [items, setItems] = useState<PreorderDraftItem[]>([]);
  const [fields, setFields] = useState<PreorderDraftFields>(() =>
    emptyPreorderFields(),
  );
  const [hydrated, setHydrated] = useState(false);
  const [itemError, setItemError] = useState<string | null>(null);

  useEffect(() => {
    const draft = readPreorderDraft();
    setItems(draft?.items ?? []);
    setFields({
      customerName: draft?.customerName ?? "",
      phone: draft?.phone ?? "",
      email: draft?.email ?? "",
      emailSubmissionReceiptRequested:
        draft?.emailSubmissionReceiptRequested ?? false,
      pickupDate: draft?.pickupDate ?? "",
      pickupTime: draft?.pickupTime ?? "",
      notes: draft?.notes ?? "",
    });
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    persistDraft(items, fields);
  }, [items, fields, hydrated]);

  const total = useMemo(() => calculateOrderTotal(items), [items]);
  const itemsJson = useMemo(
    () =>
      JSON.stringify(
        items.map((item) => ({
          cakeId: item.cakeId,
          sizeId: item.sizeId,
          quantity: item.quantity,
        })),
      ),
    [items],
  );

  function patchFields(patch: Partial<PreorderDraftFields>) {
    setFields((current) => ({ ...current, ...patch }));
  }

  function updateItem(index: number, patch: Partial<PreorderDraftItem>) {
    setItemError(null);
    setItems((current) => {
      const next = current.map((item, i) =>
        i === index ? { ...item, ...patch } : item,
      );
      const map = new Map<string, PreorderDraftItem>();
      for (const item of next) {
        const key = `${item.cakeId}::${item.sizeId}`;
        const existing = map.get(key);
        if (existing) {
          map.set(key, {
            ...existing,
            quantity: existing.quantity + item.quantity,
          });
        } else {
          map.set(key, item);
        }
      }
      return Array.from(map.values());
    });
  }

  function changeSize(index: number, sizeId: string) {
    const item = items[index];
    const cake = cakes.find((entry) => entry.id === item.cakeId);
    const size = cake?.sizes.find((entry) => entry.id === sizeId);
    if (!size) return;
    updateItem(index, {
      sizeId: size.id,
      sizeLabel: size.size,
      unitPrice: size.price,
    });
  }

  function removeItem(index: number) {
    if (items.length <= 1) {
      setItemError("Your preorder needs at least one cake.");
      return;
    }
    setItemError(null);
    setItems((current) => current.filter((_, i) => i !== index));
  }

  function handleAddAnotherCake() {
    persistDraft(items, fields);
  }

  function handleSubmit(formData: FormData) {
    if (items.length === 0) {
      setItemError("Please add at least one cake to your preorder.");
      return;
    }
    setItemError(null);
    persistDraft(items, fields);
    formAction(formData);
  }

  if (!hydrated) {
    return (
      <p className="text-skyline text-sm" aria-live="polite">
        Preparing your preorder…
      </p>
    );
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-5">
      <input name="items_json" type="hidden" value={itemsJson} />

      <section className="border-fog space-y-3 rounded-xl border bg-white px-4 py-4">
        <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
          Your cakes
        </h2>
        {items.length === 0 ? (
          <p className="text-skyline text-sm">
            No cakes yet.{" "}
            <Link className="text-signal font-medium" href="/">
              Choose a cake
            </Link>{" "}
            to continue.
          </p>
        ) : (
          <ul className="space-y-3">
            {items.map((item, index) => {
              const cake = cakes.find((entry) => entry.id === item.cakeId);
              return (
                <li
                  className="border-fog space-y-2 rounded-lg border px-3 py-3"
                  key={`${item.cakeId}-${item.sizeId}-${index}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-ink font-medium">{item.cakeName}</p>
                      <p className="text-skyline mt-0.5 text-sm">
                        {item.sizeLabel} × {item.quantity} ·{" "}
                        {formatRm(item.unitPrice * item.quantity)}
                      </p>
                    </div>
                    <button
                      className="text-skyline hover:text-ink text-xs font-medium"
                      onClick={() => removeItem(index)}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <FormField htmlFor={`size-${index}`} label="Size">
                      <FormSelect
                        id={`size-${index}`}
                        onChange={(event) =>
                          changeSize(index, event.target.value)
                        }
                        value={item.sizeId}
                      >
                        {(cake?.sizes ?? []).map((size) => (
                          <option key={size.id} value={size.id}>
                            {size.size} — {formatRm(size.price)}
                          </option>
                        ))}
                      </FormSelect>
                    </FormField>
                    <FormField htmlFor={`qty-${index}`} label="Quantity">
                      <FormInput
                        id={`qty-${index}`}
                        min={1}
                        onChange={(event) =>
                          updateItem(index, {
                            quantity: Math.max(
                              1,
                              Number(event.target.value) || 1,
                            ),
                          })
                        }
                        step={1}
                        type="number"
                        value={item.quantity}
                      />
                    </FormField>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <Link
            className="text-signal text-sm font-medium"
            href="/"
            onClick={handleAddAnotherCake}
          >
            + Add Another Cake
          </Link>
          <p className="text-ink text-sm font-semibold">
            Total · {formatRm(total)}
          </p>
        </div>
        {itemError ? (
          <p className="text-status-danger text-sm">{itemError}</p>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
          Customer
        </h2>
        <FormField htmlFor="customer_name" label="Name">
          <FormInput
            id="customer_name"
            name="customer_name"
            onChange={(event) =>
              patchFields({ customerName: event.target.value })
            }
            required
            value={fields.customerName}
          />
        </FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            help="Primary contact for WhatsApp updates"
            htmlFor="phone"
            label="WhatsApp phone"
          >
            <FormInput
              id="phone"
              name="phone"
              onChange={(event) => patchFields({ phone: event.target.value })}
              required
              type="tel"
              value={fields.phone}
            />
          </FormField>
          <FormField
            help="For a copy of your preorder submission"
            htmlFor="email"
            label="Email (optional)"
          >
            <FormInput
              id="email"
              name="email"
              onChange={(event) => patchFields({ email: event.target.value })}
              required={fields.emailSubmissionReceiptRequested}
              type="email"
              value={fields.email}
            />
          </FormField>
        </div>
        <FormCheckbox
          checked={fields.emailSubmissionReceiptRequested}
          label="Email me a copy of my preorder submission"
          name="email_submission_receipt_requested"
          onChange={(event) =>
            patchFields({
              emailSubmissionReceiptRequested: event.target.checked,
            })
          }
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
          Pickup
        </h2>
        <PickupSlotFields
          defaultDate={fields.pickupDate}
          defaultTime={fields.pickupTime}
          onDateChange={(pickupDate) => patchFields({ pickupDate })}
          onTimeChange={(pickupTime) => patchFields({ pickupTime })}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
          Notes
        </h2>
        <FormField htmlFor="notes" label="Optional notes">
          <FormTextarea
            id="notes"
            name="notes"
            onChange={(event) => patchFields({ notes: event.target.value })}
            rows={3}
            value={fields.notes}
          />
        </FormField>
      </section>

      <FormError message={state.error} />

      <FormActions>
        <FormSubmitButton pending={pending}>Submit Preorder</FormSubmitButton>
        <Link
          className="border-fog text-ink inline-flex min-h-12 items-center justify-center rounded-lg border px-5 text-sm font-medium"
          href="/"
          onClick={handleAddAnotherCake}
        >
          Back
        </Link>
      </FormActions>
    </form>
  );
}
