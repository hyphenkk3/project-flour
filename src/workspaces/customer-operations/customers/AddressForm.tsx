"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  createAddressAction,
  updateAddressAction,
  type ActionState,
} from "@/workspaces/customer-operations/customers/actions";
import type { CustomerAddress } from "@/types/customer";
import { customerFormStyles } from "@/workspaces/customer-operations/customers/ui-shared";

type AddressFormProps = {
  mode: "create" | "edit";
  customerId: string;
  address?: CustomerAddress;
  cancelHref: string;
};

const initialState: ActionState = {
  error: null,
  existingCustomerId: null,
  existingCustomerLabel: null,
};

export function AddressForm({
  mode,
  customerId,
  address,
  cancelHref,
}: AddressFormProps) {
  const action =
    mode === "create"
      ? createAddressAction.bind(null, customerId)
      : updateAddressAction.bind(null, customerId, address!.id);

  const [state, formAction, pending] = useActionState(action, initialState);
  const { fieldClass, labelClass, helpClass, errorClass } = customerFormStyles;

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-6">
      <label className={labelClass}>
        Label
        <span className={helpClass}>e.g. Home, Office, Recipient</span>
        <input
          autoCapitalize="words"
          className={fieldClass}
          defaultValue={address?.label ?? ""}
          name="label"
          required
          type="text"
        />
      </label>

      <label className={labelClass}>
        Recipient name
        <input
          autoCapitalize="words"
          autoComplete="name"
          className={fieldClass}
          defaultValue={address?.recipientName ?? ""}
          name="recipient_name"
          required
          type="text"
        />
      </label>

      <label className={labelClass}>
        Phone number
        <span className={helpClass}>Optional contact for this address</span>
        <input
          autoComplete="tel"
          className={fieldClass}
          defaultValue={address?.phoneNumber ?? ""}
          inputMode="tel"
          name="phone_number"
          type="tel"
        />
      </label>

      <label className={labelClass}>
        Address line 1
        <input
          autoComplete="address-line1"
          className={fieldClass}
          defaultValue={address?.addressLine1 ?? ""}
          name="address_line_1"
          required
          type="text"
        />
      </label>

      <label className={labelClass}>
        Address line 2
        <input
          autoComplete="address-line2"
          className={fieldClass}
          defaultValue={address?.addressLine2 ?? ""}
          name="address_line_2"
          type="text"
        />
      </label>

      <div className="grid gap-6 sm:grid-cols-2">
        <label className={labelClass}>
          Postcode
          <input
            autoComplete="postal-code"
            className={fieldClass}
            defaultValue={address?.postcode ?? ""}
            inputMode="numeric"
            name="postcode"
            required
            type="text"
          />
        </label>

        <label className={labelClass}>
          City
          <input
            autoCapitalize="words"
            autoComplete="address-level2"
            className={fieldClass}
            defaultValue={address?.city ?? ""}
            name="city"
            required
            type="text"
          />
        </label>
      </div>

      <label className={labelClass}>
        State
        <input
          autoCapitalize="words"
          autoComplete="address-level1"
          className={fieldClass}
          defaultValue={address?.state ?? ""}
          name="state"
          required
          type="text"
        />
      </label>

      <label className="border-fog text-ink flex min-h-12 items-center gap-3 rounded-lg border bg-white px-3 text-sm">
        <input
          className="size-4 accent-[var(--color-signal)]"
          defaultChecked={address?.isDefault ?? false}
          name="is_default"
          type="checkbox"
        />
        <span>
          Default address
          <span className={`${helpClass} mt-0.5 block`}>
            Only one default address per customer.
          </span>
        </span>
      </label>

      {state.error ? (
        <div className={errorClass} role="alert">
          {state.error}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          className="bg-ink text-mist hover:bg-skyline min-h-12 rounded-lg px-5 text-sm font-medium transition disabled:opacity-60"
          disabled={pending}
          type="submit"
        >
          {pending
            ? "Saving…"
            : mode === "create"
              ? "Add address"
              : "Save changes"}
        </button>
        <Link
          className="border-fog text-ink inline-flex min-h-12 items-center justify-center rounded-lg border bg-white px-5 text-sm font-medium"
          href={cancelHref}
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
