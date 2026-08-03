"use client";

import { useActionState, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  createCustomerAction,
  updateCustomerAction,
  type ActionState,
} from "@/workspaces/customer-operations/customers/actions";
import type { Customer, PreferredContact } from "@/types/customer";
import {
  displayPhone,
  formatWhatsAppDisplay,
  hasAnyContactMethod,
  normalizeEmail,
  normalizeWhatsApp,
  preferredContactErrorMessage,
} from "@/workspaces/customer-operations/customers/normalize";
import { customerFormStyles } from "@/workspaces/customer-operations/customers/ui-shared";

type CustomerFormProps = {
  mode: "create" | "edit";
  customer?: Customer;
  cancelHref: string;
};

const initialState: ActionState = {
  error: null,
  existingCustomerId: null,
  existingCustomerLabel: null,
};

const PREFERRED_CONTACTS: PreferredContact[] = ["phone", "whatsapp", "email"];

function validateCustomerFormClient(formData: FormData): string | null {
  const fullName = String(formData.get("full_name") ?? "").trim();
  if (!fullName) {
    return "Full name is required.";
  }

  const phoneNumber = displayPhone(String(formData.get("phone_number") ?? ""));
  const whatsappUsername = normalizeWhatsApp(
    String(formData.get("whatsapp_username") ?? ""),
  );
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const preferredRaw = String(formData.get("preferred_contact") ?? "").trim();
  const preferredContact = PREFERRED_CONTACTS.includes(
    preferredRaw as PreferredContact,
  )
    ? (preferredRaw as PreferredContact)
    : "phone";

  const contacts = { phoneNumber, whatsappUsername, email };

  if (!hasAnyContactMethod(contacts)) {
    return "Add at least one contact method: phone number, WhatsApp username, or email.";
  }

  return preferredContactErrorMessage(preferredContact, contacts);
}

export function CustomerForm({
  mode,
  customer,
  cancelHref,
}: CustomerFormProps) {
  const action =
    mode === "create"
      ? createCustomerAction
      : updateCustomerAction.bind(null, customer!.id);

  const [state, formAction, pending] = useActionState(action, initialState);
  const [clientError, setClientError] = useState<string | null>(null);
  const { fieldClass, labelClass, helpClass, errorClass } = customerFormStyles;
  const whatsappDefault = formatWhatsAppDisplay(
    customer?.whatsappUsername ?? null,
  );
  const displayError = clientError ?? state.error;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const error = validateCustomerFormClient(new FormData(event.currentTarget));
    if (error) {
      event.preventDefault();
      setClientError(error);
      return;
    }
    setClientError(null);
  }

  return (
    <form
      action={formAction}
      className="flex max-w-xl flex-col gap-6"
      onSubmit={handleSubmit}
    >
      <label className={labelClass}>
        Full name
        <span className={helpClass}>Required</span>
        <input
          autoCapitalize="words"
          autoComplete="name"
          className={fieldClass}
          defaultValue={customer?.fullName ?? ""}
          name="full_name"
          required
          type="text"
        />
      </label>

      <div className="space-y-4">
        <div>
          <p className="text-ink text-sm font-medium">Contact methods</p>
          <p className={helpClass}>
            Provide at least one: phone, WhatsApp username, or email.
          </p>
        </div>

        <label className={labelClass}>
          Phone number
          <input
            autoComplete="tel"
            className={fieldClass}
            defaultValue={customer?.phoneNumber ?? ""}
            inputMode="tel"
            name="phone_number"
            type="tel"
          />
        </label>

        <label className={labelClass}>
          WhatsApp username
          <span className={helpClass}>
            Optional. Only needed if the customer prefers sharing a WhatsApp
            username instead of a phone number.
          </span>
          <input
            autoCapitalize="none"
            autoCorrect="off"
            className={fieldClass}
            defaultValue={whatsappDefault ?? ""}
            name="whatsapp_username"
            spellCheck={false}
            type="text"
          />
        </label>

        <label className={labelClass}>
          Email
          <input
            autoComplete="email"
            className={fieldClass}
            defaultValue={customer?.email ?? ""}
            inputMode="email"
            name="email"
            type="email"
          />
        </label>
      </div>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="text-ink text-sm font-medium">
          Preferred contact
        </legend>
        <p className={helpClass}>
          WhatsApp may use a phone number or a WhatsApp username.
        </p>
        {(
          [
            ["phone", "Phone"],
            ["whatsapp", "WhatsApp"],
            ["email", "Email"],
          ] as const
        ).map(([value, label]) => (
          <label
            className="border-fog text-ink flex min-h-12 items-center gap-3 rounded-lg border bg-white px-3 text-sm"
            key={value}
          >
            <input
              className="size-4 accent-[var(--color-signal)]"
              defaultChecked={(customer?.preferredContact ?? "phone") === value}
              name="preferred_contact"
              type="radio"
              value={value}
            />
            {label}
          </label>
        ))}
      </fieldset>

      <label className={labelClass}>
        Notes
        <span className={helpClass}>Optional staff notes</span>
        <textarea
          className={`${fieldClass} min-h-28 resize-y`}
          defaultValue={customer?.notes ?? ""}
          name="notes"
          rows={4}
        />
      </label>

      {displayError ? (
        <div className={errorClass} role="alert">
          <p>{displayError}</p>
          {state.existingCustomerId && !clientError ? (
            <p className="mt-2">
              <Link
                className="font-medium underline underline-offset-2"
                href={`/customer-operations/customers/${state.existingCustomerId}`}
              >
                Open {state.existingCustomerLabel ?? "existing customer"}
              </Link>
            </p>
          ) : null}
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
              ? "Add customer"
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
