"use client";

import { useActionState } from "react";
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
import type { Customer } from "@/types/customer";
import type { OrderDetail } from "@/types/order";
import {
  createOrderAction,
  updateOrderAction,
  type OrderActionState,
} from "@/workspaces/customer-operations/orders/actions";
import {
  fulfilmentMethodLabel,
  pickupTimeInputValue,
} from "@/workspaces/customer-operations/orders/status";

type OrderFormProps = {
  mode: "create" | "edit";
  customers: Customer[];
  order?: OrderDetail;
  cancelHref: string;
  defaultCustomerId?: string;
};

const initialState: OrderActionState = { error: null };

export function OrderForm({
  mode,
  customers,
  order,
  cancelHref,
  defaultCustomerId,
}: OrderFormProps) {
  const action =
    mode === "create"
      ? createOrderAction
      : updateOrderAction.bind(null, order!.id);

  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-6">
      <FormField
        help="Orders must be linked to an existing customer."
        htmlFor="customer_id"
        label="Customer"
      >
        <FormSelect
          defaultValue={order?.customerId ?? defaultCustomerId ?? ""}
          id="customer_id"
          name="customer_id"
          required
        >
          <option disabled value="">
            Select customer
          </option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.fullName}
            </option>
          ))}
        </FormSelect>
      </FormField>

      <FormField htmlFor="fulfilment_method" label="Fulfilment method">
        <FormSelect
          defaultValue={order?.fulfilmentMethod ?? "pickup"}
          id="fulfilment_method"
          name="fulfilment_method"
          required
        >
          <option value="pickup">{fulfilmentMethodLabel("pickup")}</option>
          <option value="delivery">{fulfilmentMethodLabel("delivery")}</option>
          <option value="drive_through">
            {fulfilmentMethodLabel("drive_through")}
          </option>
        </FormSelect>
      </FormField>

      <div className="grid gap-6 sm:grid-cols-2">
        <FormField htmlFor="pickup_date" label="Pickup date">
          <FormInput
            defaultValue={order?.pickupDate ?? ""}
            id="pickup_date"
            name="pickup_date"
            required
            type="date"
          />
        </FormField>

        <FormField htmlFor="pickup_time" label="Pickup time">
          <FormInput
            defaultValue={
              order ? pickupTimeInputValue(order.pickupTime) : "12:00"
            }
            id="pickup_time"
            name="pickup_time"
            required
            type="time"
          />
        </FormField>
      </div>

      <FormField
        help="Visible to Customer Operations staff only."
        htmlFor="internal_notes"
        label="Internal notes"
      >
        <FormTextarea
          defaultValue={order?.internalNotes ?? ""}
          id="internal_notes"
          name="internal_notes"
          rows={3}
        />
      </FormField>

      <FormField
        help="Notes from or for the customer."
        htmlFor="customer_notes"
        label="Customer notes"
      >
        <FormTextarea
          defaultValue={order?.customerNotes ?? ""}
          id="customer_notes"
          name="customer_notes"
          rows={3}
        />
      </FormField>

      <FormError message={state.error} />

      <FormActions>
        <FormSubmitButton pending={pending}>
          {mode === "create" ? "Create order" : "Save changes"}
        </FormSubmitButton>
        <Link
          className="border-fog text-ink inline-flex min-h-12 items-center justify-center rounded-lg border bg-white px-5 text-sm font-medium"
          href={cancelHref}
        >
          Cancel
        </Link>
      </FormActions>
    </form>
  );
}
