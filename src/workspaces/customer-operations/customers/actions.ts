"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/foundation/auth/session";
import { canAccessWorkspace } from "@/foundation/navigation/access";
import { createClient } from "@/lib/supabase/server";
import type {
  CustomerAddressInput,
  CustomerInput,
  PreferredContact,
} from "@/types/customer";
import {
  displayPhone,
  hasAnyContactMethod,
  normalizeEmail,
  normalizePhone,
  normalizeWhatsApp,
  preferredContactErrorMessage,
  customerIdentityLabel,
} from "@/workspaces/customer-operations/customers/normalize";
import { findContactDuplicate } from "@/workspaces/customer-operations/customers/queries";

export type ActionState = {
  error: string | null;
  existingCustomerId?: string | null;
  existingCustomerLabel?: string | null;
};

const PREFERRED_CONTACTS: PreferredContact[] = ["phone", "whatsapp", "email"];

const emptyActionState: ActionState = {
  error: null,
  existingCustomerId: null,
  existingCustomerLabel: null,
};

async function requireCustomerOperationsStaff() {
  const staff = await requireStaff();

  if (!canAccessWorkspace(staff.role.code, "customer_operations")) {
    redirect("/home");
  }

  return staff;
}

function emptyToNull(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function parsePreferredContact(
  value: FormDataEntryValue | null,
): PreferredContact {
  const text = String(value ?? "").trim();
  if (PREFERRED_CONTACTS.includes(text as PreferredContact)) {
    return text as PreferredContact;
  }
  return "phone";
}

function parseCustomerInput(formData: FormData): CustomerInput | string {
  const fullName = String(formData.get("full_name") ?? "").trim();

  if (!fullName) {
    return "Full name is required.";
  }

  const phoneNumber = displayPhone(String(formData.get("phone_number") ?? ""));
  const phoneNormalized = normalizePhone(phoneNumber);
  const whatsappUsername = normalizeWhatsApp(
    String(formData.get("whatsapp_username") ?? ""),
  );
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const preferredContact = parsePreferredContact(
    formData.get("preferred_contact"),
  );
  const notes = emptyToNull(formData.get("notes"));

  const contacts = { phoneNumber, whatsappUsername, email };

  if (!hasAnyContactMethod(contacts)) {
    return "Add at least one contact method: phone number, WhatsApp username, or email.";
  }

  const preferredError = preferredContactErrorMessage(
    preferredContact,
    contacts,
  );
  if (preferredError) {
    return preferredError;
  }

  return {
    fullName,
    phoneNumber,
    phoneNormalized,
    whatsappUsername,
    email,
    preferredContact,
    notes,
  };
}

function parseAddressInput(formData: FormData): CustomerAddressInput | string {
  const label = String(formData.get("label") ?? "").trim();
  const recipientName = String(formData.get("recipient_name") ?? "").trim();
  const addressLine1 = String(formData.get("address_line_1") ?? "").trim();
  const postcode = String(formData.get("postcode") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const state = String(formData.get("state") ?? "").trim();

  if (!label) return "Label is required.";
  if (!recipientName) return "Recipient name is required.";
  if (!addressLine1) return "Address line 1 is required.";
  if (!postcode) return "Postcode is required.";
  if (!city) return "City is required.";
  if (!state) return "State is required.";

  return {
    label,
    recipientName,
    phoneNumber: displayPhone(String(formData.get("phone_number") ?? "")),
    addressLine1,
    addressLine2: emptyToNull(formData.get("address_line_2")),
    postcode,
    city,
    state,
    isDefault: formData.get("is_default") === "on",
  };
}

function revalidateCustomerPaths(customerId?: string) {
  revalidatePath("/customer-operations/customers");
  if (customerId) {
    revalidatePath(`/customer-operations/customers/${customerId}`);
    revalidatePath(`/customer-operations/customers/${customerId}/edit`);
  }
}

function duplicateFieldLabel(
  matchedOn: "phone" | "whatsapp" | "email",
): string {
  switch (matchedOn) {
    case "phone":
      return "phone number";
    case "whatsapp":
      return "WhatsApp username";
    case "email":
      return "email";
  }
}

function duplicateActionState(
  match: NonNullable<Awaited<ReturnType<typeof findContactDuplicate>>>,
): ActionState {
  const label = customerIdentityLabel(
    match.customer.fullName,
    match.customer.phoneNumber,
    match.customer.phoneNormalized,
  );
  const field = duplicateFieldLabel(match.matchedOn);

  return {
    error: `This ${field} is already used by ${label}.`,
    existingCustomerId: match.customer.id,
    existingCustomerLabel: label,
  };
}

function isUniqueViolation(error: {
  code?: string;
  message?: string;
}): boolean {
  return error.code === "23505" || /duplicate key/i.test(error.message ?? "");
}

export async function createCustomerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireCustomerOperationsStaff();
  const parsed = parseCustomerInput(formData);

  if (typeof parsed === "string") {
    return { ...emptyActionState, error: parsed };
  }

  const duplicate = await findContactDuplicate({
    phoneNormalized: parsed.phoneNormalized,
    whatsappUsername: parsed.whatsappUsername,
    email: parsed.email,
  });

  if (duplicate) {
    return duplicateActionState(duplicate);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({
      full_name: parsed.fullName,
      phone_number: parsed.phoneNumber,
      phone_normalized: parsed.phoneNormalized,
      whatsapp_username: parsed.whatsappUsername,
      email: parsed.email,
      preferred_contact: parsed.preferredContact,
      notes: parsed.notes,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error && isUniqueViolation(error)) {
      const raced = await findContactDuplicate({
        phoneNormalized: parsed.phoneNormalized,
        whatsappUsername: parsed.whatsappUsername,
        email: parsed.email,
      });
      if (raced) {
        return duplicateActionState(raced);
      }
    }

    return { ...emptyActionState, error: "Unable to create customer." };
  }

  revalidateCustomerPaths(data.id);
  redirect(`/customer-operations/customers/${data.id}`);
}

export async function updateCustomerAction(
  customerId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireCustomerOperationsStaff();
  const parsed = parseCustomerInput(formData);

  if (typeof parsed === "string") {
    return { ...emptyActionState, error: parsed };
  }

  const duplicate = await findContactDuplicate({
    phoneNormalized: parsed.phoneNormalized,
    whatsappUsername: parsed.whatsappUsername,
    email: parsed.email,
    excludeCustomerId: customerId,
  });

  if (duplicate) {
    return duplicateActionState(duplicate);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .update({
      full_name: parsed.fullName,
      phone_number: parsed.phoneNumber,
      phone_normalized: parsed.phoneNormalized,
      whatsapp_username: parsed.whatsappUsername,
      email: parsed.email,
      preferred_contact: parsed.preferredContact,
      notes: parsed.notes,
    })
    .eq("id", customerId);

  if (error) {
    if (isUniqueViolation(error)) {
      const raced = await findContactDuplicate({
        phoneNormalized: parsed.phoneNormalized,
        whatsappUsername: parsed.whatsappUsername,
        email: parsed.email,
        excludeCustomerId: customerId,
      });
      if (raced) {
        return duplicateActionState(raced);
      }
    }

    return { ...emptyActionState, error: "Unable to update customer." };
  }

  revalidateCustomerPaths(customerId);
  redirect(`/customer-operations/customers/${customerId}`);
}

async function clearDefaultAddresses(
  customerId: string,
  exceptAddressId?: string,
) {
  const supabase = await createClient();
  let request = supabase
    .from("customer_addresses")
    .update({ is_default: false })
    .eq("customer_id", customerId)
    .eq("is_default", true);

  if (exceptAddressId) {
    request = request.neq("id", exceptAddressId);
  }

  return request;
}

export async function createAddressAction(
  customerId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireCustomerOperationsStaff();
  const parsed = parseAddressInput(formData);

  if (typeof parsed === "string") {
    return { ...emptyActionState, error: parsed };
  }

  const supabase = await createClient();

  if (parsed.isDefault) {
    const { error: clearError } = await clearDefaultAddresses(customerId);
    if (clearError) {
      return { ...emptyActionState, error: "Unable to create address." };
    }
  }

  const { error } = await supabase.from("customer_addresses").insert({
    customer_id: customerId,
    label: parsed.label,
    recipient_name: parsed.recipientName,
    phone_number: parsed.phoneNumber,
    address_line_1: parsed.addressLine1,
    address_line_2: parsed.addressLine2,
    postcode: parsed.postcode,
    city: parsed.city,
    state: parsed.state,
    is_default: parsed.isDefault,
  });

  if (error) {
    return { ...emptyActionState, error: "Unable to create address." };
  }

  revalidateCustomerPaths(customerId);
  redirect(`/customer-operations/customers/${customerId}`);
}

export async function updateAddressAction(
  customerId: string,
  addressId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireCustomerOperationsStaff();
  const parsed = parseAddressInput(formData);

  if (typeof parsed === "string") {
    return { ...emptyActionState, error: parsed };
  }

  const supabase = await createClient();

  if (parsed.isDefault) {
    const { error: clearError } = await clearDefaultAddresses(
      customerId,
      addressId,
    );
    if (clearError) {
      return { ...emptyActionState, error: "Unable to update address." };
    }
  }

  const { error } = await supabase
    .from("customer_addresses")
    .update({
      label: parsed.label,
      recipient_name: parsed.recipientName,
      phone_number: parsed.phoneNumber,
      address_line_1: parsed.addressLine1,
      address_line_2: parsed.addressLine2,
      postcode: parsed.postcode,
      city: parsed.city,
      state: parsed.state,
      is_default: parsed.isDefault,
    })
    .eq("id", addressId)
    .eq("customer_id", customerId);

  if (error) {
    return { ...emptyActionState, error: "Unable to update address." };
  }

  revalidateCustomerPaths(customerId);
  redirect(`/customer-operations/customers/${customerId}`);
}

export async function deleteAddressAction(
  customerId: string,
  addressId: string,
): Promise<ActionState> {
  await requireCustomerOperationsStaff();

  const supabase = await createClient();
  const { error } = await supabase
    .from("customer_addresses")
    .delete()
    .eq("id", addressId)
    .eq("customer_id", customerId);

  if (error) {
    return { ...emptyActionState, error: "Unable to delete address." };
  }

  revalidateCustomerPaths(customerId);
  redirect(`/customer-operations/customers/${customerId}`);
}
