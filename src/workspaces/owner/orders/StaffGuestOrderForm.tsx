"use client";

import { useActionState, useMemo, useState } from "react";
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
import { OwnerPickupFields } from "@/components/ui/OwnerPickupFields";
import {
  buildEditablePaidAddonDrafts,
  paidAddonDraftsToMutationPayload,
  type EditablePaidAddonDraft,
} from "@/engines/orders/paid-addons";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import type { PaidAddonType, StorefrontCake } from "@/types/storefront";
import type { CollectionComplimentaryOption } from "@/workspaces/owner/orders/queries";
import {
  createStaffGuestOrderAction,
  type CreateStaffGuestOrderState,
} from "@/workspaces/owner/orders/actions";
import { STAFF_GUEST_ORDER_SOURCES } from "@/workspaces/owner/orders/labels";
import { OrderPaidAddonsEditor } from "@/workspaces/owner/orders/OrderPaidAddonsEditor";

type EditableItem = {
  key: string;
  cakeId: string;
  cakeSizeId: string;
  quantity: number;
};

type EditableComplimentary = {
  typeId: string | null;
  name: string;
  quantity: number;
  sortOrder: number;
};

type StaffGuestOrderFormProps = {
  cakes: StorefrontCake[];
  complimentaryOptions: CollectionComplimentaryOption[];
  paidAddonCatalog: PaidAddonType[];
};

const initialState: CreateStaffGuestOrderState = {
  error: null,
};

export function StaffGuestOrderForm({
  cakes,
  complimentaryOptions,
  paidAddonCatalog,
}: StaffGuestOrderFormProps) {
  const [state, formAction, pending] = useActionState(
    createStaffGuestOrderAction,
    initialState,
  );

  const [items, setItems] = useState<EditableItem[]>(() => {
    const first = cakes[0];
    return [
      {
        key: crypto.randomUUID(),
        cakeId: first?.id ?? "",
        cakeSizeId: first?.sizes[0]?.id ?? "",
        quantity: 1,
      },
    ];
  });

  const [complimentary, setComplimentary] = useState<EditableComplimentary[]>(
    () =>
      complimentaryOptions.map((option) => ({
        typeId: option.typeId,
        name: option.name,
        quantity: option.isDefault ? option.defaultQuantity : 0,
        sortOrder: option.sortOrder,
      })),
  );

  const [paidAddonDrafts, setPaidAddonDrafts] = useState<
    EditablePaidAddonDraft[]
  >(() => buildEditablePaidAddonDrafts({ catalog: paidAddonCatalog }));

  const [needsAttention, setNeedsAttention] = useState(false);

  const itemsJson = useMemo(() => JSON.stringify(items), [items]);
  const complimentaryJson = useMemo(
    () => JSON.stringify(complimentary),
    [complimentary],
  );
  const paidAddonsJson = useMemo(
    () => JSON.stringify(paidAddonDraftsToMutationPayload(paidAddonDrafts)),
    [paidAddonDrafts],
  );

  function updateCakeLine(key: string, patch: Partial<EditableItem>) {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  }

  function addCakeLine() {
    const first = cakes[0];
    setItems((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        cakeId: first?.id ?? "",
        cakeSizeId: first?.sizes[0]?.id ?? "",
        quantity: 1,
      },
    ]);
  }

  function removeCakeLine(key: string) {
    setItems((current) =>
      current.length <= 1 ? current : current.filter((item) => item.key !== key),
    );
  }

  if (cakes.length === 0) {
    return (
      <div className="border-fog space-y-4 rounded-xl border bg-white p-5">
        <p className="text-ink text-sm">
          No active or seasonal Library cakes are available. Add cakes in the
          Library before creating a staff order.
        </p>
        <Link className="text-signal text-sm font-medium" href="/owner">
          ← Operations
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      <input name="items_json" type="hidden" value={itemsJson} />
      <input name="complimentary_json" type="hidden" value={complimentaryJson} />
      <input name="paid_addons_json" type="hidden" value={paidAddonsJson} />

      <section className="border-fog space-y-4 rounded-xl border bg-white p-5">
        <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
          Customer
        </h2>
        <FormField htmlFor="guest_name" label="Customer name">
          <FormInput id="guest_name" name="guest_name" required />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            help="Optional for staff-created orders (e.g. Lex-mediated)."
            htmlFor="guest_phone"
            label="WhatsApp phone (optional)"
          >
            <FormInput id="guest_phone" name="guest_phone" type="tel" />
          </FormField>
          <FormField htmlFor="guest_email" label="Email (optional)">
            <FormInput id="guest_email" name="guest_email" type="email" />
          </FormField>
        </div>
        <FormField htmlFor="order_source" label="Order source">
          <FormSelect defaultValue="jotform" id="order_source" name="order_source" required>
            {STAFF_GUEST_ORDER_SOURCES.map((source) => (
              <option key={source.value} value={source.value}>
                {source.label}
              </option>
            ))}
          </FormSelect>
        </FormField>
        <FormCheckbox
          help="Shows as (crew) later. Does not change payment or discounts."
          label="Crew order"
          name="crew_order"
          value="1"
        />
      </section>

      <section className="border-fog space-y-4 rounded-xl border bg-white p-5">
        <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
          Pickup
        </h2>
        <OwnerPickupFields />
      </section>

      <section className="border-fog space-y-4 rounded-xl border bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
            Whole cake
          </h2>
          <button
            className="text-signal text-sm font-medium"
            onClick={addCakeLine}
            type="button"
          >
            + Add cake
          </button>
        </div>
        <ul className="space-y-4">
          {items.map((item) => {
            const cake =
              cakes.find((entry) => entry.id === item.cakeId) ?? cakes[0];
            return (
              <li
                className="border-fog space-y-3 rounded-lg border p-3"
                key={item.key}
              >
                <FormField label="Cake">
                  <FormSelect
                    onChange={(event) => {
                      const nextCake = cakes.find(
                        (entry) => entry.id === event.target.value,
                      );
                      updateCakeLine(item.key, {
                        cakeId: event.target.value,
                        cakeSizeId: nextCake?.sizes[0]?.id ?? "",
                      });
                    }}
                    value={item.cakeId}
                  >
                    {cakes.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </FormSelect>
                </FormField>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label="Size">
                    <FormSelect
                      onChange={(event) =>
                        updateCakeLine(item.key, {
                          cakeSizeId: event.target.value,
                        })
                      }
                      value={item.cakeSizeId}
                    >
                      {(cake?.sizes ?? []).map((size) => (
                        <option key={size.id} value={size.id}>
                          {size.size} — {formatRm(size.price)}
                        </option>
                      ))}
                    </FormSelect>
                  </FormField>
                  <FormField label="Quantity">
                    <FormInput
                      min={1}
                      onChange={(event) =>
                        updateCakeLine(item.key, {
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
                {items.length > 1 ? (
                  <button
                    className="text-skyline hover:text-ink text-xs font-medium"
                    onClick={() => removeCakeLine(item.key)}
                    type="button"
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="border-fog space-y-4 rounded-xl border bg-white p-5">
        <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
          Add-ons
        </h2>
        <OrderPaidAddonsEditor
          drafts={paidAddonDrafts}
          onChange={setPaidAddonDrafts}
        />
      </section>

      <section className="border-fog space-y-4 rounded-xl border bg-white p-5">
        <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
          Preparation
        </h2>
        <ul className="space-y-3">
          {complimentary.map((item, index) => (
            <li
              className="flex items-center justify-between gap-3"
              key={`${item.name}-${index}`}
            >
              <span className="text-ink text-sm">{item.name}</span>
              <FormInput
                aria-label={`${item.name} quantity`}
                className="w-24"
                min={0}
                onChange={(event) => {
                  const quantity = Math.max(0, Number(event.target.value) || 0);
                  setComplimentary((current) =>
                    current.map((entry, i) =>
                      i === index ? { ...entry, quantity } : entry,
                    ),
                  );
                }}
                step={1}
                type="number"
                value={item.quantity}
              />
            </li>
          ))}
        </ul>
        <FormCheckbox
          help="Physical purchase receipt with the cake at pickup. Not the email submission copy."
          label="Include receipt"
          name="include_receipt"
          value="1"
        />
      </section>

      <section className="border-fog space-y-4 rounded-xl border bg-white p-5">
        <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
          Bakery attention
        </h2>
        <FormCheckbox
          checked={needsAttention}
          label="Needs bakery attention"
          name="needs_bakery_attention"
          onChange={(event) => setNeedsAttention(event.target.checked)}
          value="1"
        />
        {needsAttention ? (
          <FormField
            help="Shown later in Quick View / Crew message."
            htmlFor="bakery_attention_note"
            label="Attention note"
          >
            <FormInput
              id="bakery_attention_note"
              name="bakery_attention_note"
              placeholder="Early pickup, less sweet, special handling…"
            />
          </FormField>
        ) : null}
      </section>

      <section className="border-fog space-y-4 rounded-xl border bg-white p-5">
        <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
          Notes
        </h2>
        <FormField htmlFor="customer_notes" label="Customer notes">
          <FormTextarea id="customer_notes" name="customer_notes" rows={3} />
        </FormField>
        <FormField htmlFor="internal_notes" label="Internal notes">
          <FormTextarea id="internal_notes" name="internal_notes" rows={3} />
        </FormField>
      </section>

      <FormError message={state.error} />

      <FormActions>
        <FormSubmitButton pending={pending}>Create Order</FormSubmitButton>
        <Link
          className="border-fog text-ink hover:bg-mist inline-flex min-h-12 items-center justify-center rounded-lg border px-5 text-sm font-medium"
          href="/owner"
        >
          Cancel
        </Link>
      </FormActions>
    </form>
  );
}
