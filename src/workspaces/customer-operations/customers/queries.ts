import { createClient } from "@/lib/supabase/server";
import type {
  Customer,
  CustomerAddress,
  PreferredContact,
} from "@/types/customer";
import {
  customerIdentityLabel,
  normalizePhone,
} from "@/workspaces/customer-operations/customers/normalize";

type CustomerRow = {
  id: string;
  full_name: string;
  phone_number: string | null;
  phone_normalized: string | null;
  whatsapp_username: string | null;
  email: string | null;
  preferred_contact: PreferredContact;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type AddressRow = {
  id: string;
  customer_id: string;
  label: string;
  recipient_name: string;
  phone_number: string | null;
  address_line_1: string;
  address_line_2: string | null;
  postcode: string;
  city: string;
  state: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export function mapCustomer(row: CustomerRow): Customer {
  const phoneNormalized =
    row.phone_normalized ?? normalizePhone(row.phone_number);

  return {
    id: row.id,
    fullName: row.full_name,
    phoneNumber: row.phone_number,
    phoneNormalized,
    whatsappUsername: row.whatsapp_username,
    email: row.email,
    preferredContact: row.preferred_contact,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapAddress(row: AddressRow): CustomerAddress {
  return {
    id: row.id,
    customerId: row.customer_id,
    label: row.label,
    recipientName: row.recipient_name,
    phoneNumber: row.phone_number,
    addressLine1: row.address_line_1,
    addressLine2: row.address_line_2,
    postcode: row.postcode,
    city: row.city,
    state: row.state,
    isDefault: row.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export { customerIdentityLabel };

export async function listCustomers(query?: string): Promise<Customer[]> {
  const supabase = await createClient();
  const trimmed = query?.trim() ?? "";

  let request = supabase
    .from("customers")
    .select("*")
    .order("full_name", { ascending: true });

  if (trimmed) {
    const escaped = trimmed
      .replaceAll("\\", "\\\\")
      .replaceAll("%", "\\%")
      .replaceAll("_", "\\_")
      .replaceAll(",", " ");
    const pattern = `%${escaped}%`;
    const digits = trimmed.replace(/\D/g, "");
    const filters = [
      `full_name.ilike."${pattern}"`,
      `phone_number.ilike."${pattern}"`,
      `whatsapp_username.ilike."${pattern}"`,
      `email.ilike."${pattern}"`,
    ];

    if (digits.length > 0) {
      filters.push(`phone_normalized.ilike."%${digits}%"`);
    }

    request = request.or(filters.join(","));
  }

  const { data, error } = await request;

  if (error) {
    throw error;
  }

  return (data as CustomerRow[]).map(mapCustomer);
}

export async function getCustomerById(id: string): Promise<Customer | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapCustomer(data as CustomerRow) : null;
}

export async function listCustomerAddresses(
  customerId: string,
): Promise<CustomerAddress[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_addresses")
    .select("*")
    .eq("customer_id", customerId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data as AddressRow[]).map(mapAddress);
}

export async function getCustomerAddressById(
  addressId: string,
): Promise<CustomerAddress | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_addresses")
    .select("*")
    .eq("id", addressId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapAddress(data as AddressRow) : null;
}

export type ContactDuplicateMatch = {
  customer: Customer;
  matchedOn: "phone" | "whatsapp" | "email";
};

/**
 * Exact match on normalized phone, WhatsApp username, or email.
 * Optionally exclude a customer id (for updates).
 */
export async function findContactDuplicate(options: {
  phoneNormalized: string | null;
  whatsappUsername: string | null;
  email: string | null;
  excludeCustomerId?: string;
}): Promise<ContactDuplicateMatch | null> {
  const supabase = await createClient();

  async function lookup(
    column: "phone_normalized" | "whatsapp_username" | "email",
    value: string,
    matchedOn: ContactDuplicateMatch["matchedOn"],
  ): Promise<ContactDuplicateMatch | null> {
    let request = supabase.from("customers").select("*").eq(column, value);

    if (options.excludeCustomerId) {
      request = request.neq("id", options.excludeCustomerId);
    }

    const { data, error } = await request.maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return null;
    }

    return {
      customer: mapCustomer(data as CustomerRow),
      matchedOn,
    };
  }

  if (options.phoneNormalized) {
    const match = await lookup(
      "phone_normalized",
      options.phoneNormalized,
      "phone",
    );
    if (match) return match;
  }

  if (options.whatsappUsername) {
    const match = await lookup(
      "whatsapp_username",
      options.whatsappUsername,
      "whatsapp",
    );
    if (match) return match;
  }

  if (options.email) {
    const match = await lookup("email", options.email, "email");
    if (match) return match;
  }

  return null;
}
