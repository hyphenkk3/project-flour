"use client";

import { useActionState, useState } from "react";
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
import { PickupSlotFields } from "@/components/ui/PickupSlotFields";
import type { StorefrontCake } from "@/types/storefront";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import {
  submitGuestPreorderAction,
  type CheckoutState,
} from "@/workspaces/storefront/checkout/actions";

const initialState: CheckoutState = { error: null };

type GuestCheckoutFormProps = {
  cake: StorefrontCake;
  initialSizeId?: string;
};

export function GuestCheckoutForm({
  cake,
  initialSizeId,
}: GuestCheckoutFormProps) {
  const [state, formAction, pending] = useActionState(
    submitGuestPreorderAction,
    initialState,
  );

  const defaultSize =
    initialSizeId && cake.sizes.some((size) => size.id === initialSizeId)
      ? initialSizeId
      : (cake.sizes[0]?.id ?? "");

  const [sizeId, setSizeId] = useState(defaultSize);
  const selectedSize = cake.sizes.find((size) => size.id === sizeId);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input name="cake_id" type="hidden" value={cake.id} />

      <section className="border-fog rounded-xl border bg-white px-4 py-3">
        <p className="text-ink font-medium">{cake.name}</p>
        <p className="text-skyline mt-1 text-sm">
          {selectedSize
            ? `${selectedSize.size} · ${formatRm(selectedSize.price)}`
            : "Choose a size below"}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
          Customer
        </h2>
        <FormField htmlFor="customer_name" label="Name">
          <FormInput id="customer_name" name="customer_name" required />
        </FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField htmlFor="phone" label="Phone">
            <FormInput id="phone" name="phone" required type="tel" />
          </FormField>
          <FormField htmlFor="email" label="Email">
            <FormInput id="email" name="email" required type="email" />
          </FormField>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
          Pickup
        </h2>
        <PickupSlotFields />
      </section>

      <section className="space-y-3">
        <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
          Order
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField htmlFor="cake_size_id" label="Size">
            <FormSelect
              id="cake_size_id"
              name="cake_size_id"
              onChange={(event) => setSizeId(event.target.value)}
              required
              value={sizeId}
            >
              {cake.sizes.map((size) => (
                <option key={size.id} value={size.id}>
                  {size.size} — {formatRm(size.price)}
                </option>
              ))}
            </FormSelect>
          </FormField>
          <FormField htmlFor="quantity" label="Quantity">
            <FormInput
              defaultValue={1}
              id="quantity"
              min={1}
              name="quantity"
              required
              step={1}
              type="number"
            />
          </FormField>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
          Notes
        </h2>
        <FormField htmlFor="notes" label="Optional notes">
          <FormTextarea id="notes" name="notes" rows={3} />
        </FormField>
      </section>

      <FormError message={state.error} />

      <FormActions>
        <FormSubmitButton pending={pending}>Submit Preorder</FormSubmitButton>
        <Link
          className="border-fog text-ink inline-flex min-h-12 items-center justify-center rounded-lg border px-5 text-sm font-medium"
          href={`/cakes/${cake.id}`}
        >
          Back
        </Link>
      </FormActions>
    </form>
  );
}
