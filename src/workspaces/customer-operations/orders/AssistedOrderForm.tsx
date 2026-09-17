"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import {
  FormActions,
  FormError,
  FormField,
  FormInput,
  FormSelect,
  FormSubmitButton,
  FormTextarea,
} from "@/components/ui/form";
import {
  defaultDeliveryCreateDraft,
  defaultOwnerCreateFulfilmentMethod,
  type DeliveryCreateDraft,
  type OwnerCreateFulfilmentMethod,
} from "@/engines/orders/fulfilment";
import type { Customer } from "@/types/customer";
import type { StorefrontCake } from "@/types/storefront";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import {
  createOrderAction,
  type OrderActionState,
} from "@/workspaces/customer-operations/orders/actions";
import { STAFF_GUEST_ORDER_SOURCES } from "@/workspaces/owner/orders/labels";
import { OrderFulfilmentCreateFields } from "@/workspaces/owner/orders/OrderFulfilmentCreateFields";
import { OPERATING_HOURS_SEED } from "@/engines/business-calendar/operating-hours-seed";
import type { OperatingHoursSnapshot } from "@/engines/business-calendar/operating-hours";

type CakeLine = {
  key: string;
  cakeId: string;
  cakeSizeId: string;
  quantity: number;
};

type AssistedOrderFormProps = {
  customers: Customer[];
  cakes: StorefrontCake[];
  defaultCustomerId?: string;
  hoursSnapshot?: OperatingHoursSnapshot;
};

const initialState: OrderActionState = { error: null };

function initialCakeLine(cakes: StorefrontCake[]): CakeLine {
  const first = cakes[0];
  return {
    key: crypto.randomUUID(),
    cakeId: first?.id ?? "",
    cakeSizeId: first?.sizes[0]?.id ?? "",
    quantity: 1,
  };
}

export function AssistedOrderForm({
  customers,
  cakes,
  defaultCustomerId,
  hoursSnapshot = OPERATING_HOURS_SEED,
}: AssistedOrderFormProps) {
  const [state, formAction, pending] = useActionState(
    createOrderAction,
    initialState,
  );
  const [customerId, setCustomerId] = useState(defaultCustomerId ?? "");
  const [fulfilmentMethod, setFulfilmentMethod] =
    useState<OwnerCreateFulfilmentMethod>(defaultOwnerCreateFulfilmentMethod);
  const [deliveryDraft, setDeliveryDraft] = useState<DeliveryCreateDraft>(
    defaultDeliveryCreateDraft,
  );
  const [items, setItems] = useState<CakeLine[]>(() => [
    initialCakeLine(cakes),
  ]);

  const selectedCustomer =
    customers.find((customer) => customer.id === customerId) ?? null;
  const customerName = selectedCustomer?.fullName ?? "";
  const customerPhone = selectedCustomer?.phoneNumber ?? "";

  const itemsJson = useMemo(() => JSON.stringify(items), [items]);
  const deliveryJson = useMemo(
    () => JSON.stringify(deliveryDraft),
    [deliveryDraft],
  );

  function updateCakeLine(key: string, patch: Partial<CakeLine>) {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  }

  function addCakeLine() {
    setItems((current) => [...current, initialCakeLine(cakes)]);
  }

  function removeCakeLine(key: string) {
    setItems((current) =>
      current.length <= 1 ? current : current.filter((item) => item.key !== key),
    );
  }

  if (cakes.length === 0) {
    return (
      <p className="text-skyline text-sm">
        No active or seasonal Library cakes are available. Add cakes in the
        Library before creating an assisted order.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-6">
      <input name="items_json" type="hidden" value={itemsJson} />
      <input name="fulfilment_method" type="hidden" value={fulfilmentMethod} />
      <input name="delivery_json" type="hidden" value={deliveryJson} />

      <FormField
        help="The customer's name and phone are copied onto the order. The CRM record is not written onto the operational order."
        htmlFor="customer_id"
        label="Customer"
      >
        <FormSelect
          id="customer_id"
          name="customer_id"
          onChange={(event) => setCustomerId(event.target.value)}
          required
          value={customerId}
        >
          <option disabled value="">
            Select customer
          </option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.fullName}
              {customer.phoneNumber ? ` · ${customer.phoneNumber}` : ""}
            </option>
          ))}
        </FormSelect>
      </FormField>

      {selectedCustomer ? (
        <p className="text-skyline text-sm">
          Order identity: {customerName}
          {customerPhone ? ` · ${customerPhone}` : " · no phone on file"}
        </p>
      ) : null}

      <FormField htmlFor="order_source" label="Order source">
        <FormSelect
          defaultValue="whatsapp"
          id="order_source"
          name="order_source"
          required
        >
          {STAFF_GUEST_ORDER_SOURCES.map((source) => (
            <option key={source.value} value={source.value}>
              {source.label}
            </option>
          ))}
        </FormSelect>
      </FormField>

      <OrderFulfilmentCreateFields
        customerName={customerName}
        customerPhone={customerPhone}
        delivery={deliveryDraft}
        hoursSnapshot={hoursSnapshot}
        method={fulfilmentMethod}
        onDeliveryChange={setDeliveryDraft}
        onMethodChange={setFulfilmentMethod}
      />

      <section className="border-fog space-y-4 rounded-xl border bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
            Cakes
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

      <FormField
        help="Notes from or for the customer."
        htmlFor="customer_notes"
        label="Customer notes"
      >
        <FormTextarea id="customer_notes" name="customer_notes" rows={3} />
      </FormField>

      <FormField
        help="Visible to Customer Operations staff only."
        htmlFor="internal_notes"
        label="Internal notes"
      >
        <FormTextarea id="internal_notes" name="internal_notes" rows={3} />
      </FormField>

      <FormError message={state.error} />

      <FormActions>
        <FormSubmitButton pending={pending}>Create order</FormSubmitButton>
        <Link
          className="border-fog text-ink inline-flex min-h-12 items-center justify-center rounded-lg border bg-white px-5 text-sm font-medium"
          href="/customer-operations/orders"
        >
          Cancel
        </Link>
      </FormActions>
    </form>
  );
}
