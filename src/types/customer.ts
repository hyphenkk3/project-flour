export type PreferredContact = "phone" | "whatsapp" | "email";

export type Customer = {
  id: string;
  fullName: string;
  phoneNumber: string | null;
  phoneNormalized: string | null;
  whatsappUsername: string | null;
  email: string | null;
  preferredContact: PreferredContact;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CustomerAddress = {
  id: string;
  customerId: string;
  label: string;
  recipientName: string;
  phoneNumber: string | null;
  addressLine1: string;
  addressLine2: string | null;
  postcode: string;
  city: string;
  state: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CustomerInput = {
  fullName: string;
  phoneNumber: string | null;
  phoneNormalized: string | null;
  whatsappUsername: string | null;
  email: string | null;
  preferredContact: PreferredContact;
  notes: string | null;
};

export type CustomerAddressInput = {
  label: string;
  recipientName: string;
  phoneNumber: string | null;
  addressLine1: string;
  addressLine2: string | null;
  postcode: string;
  city: string;
  state: string;
  isDefault: boolean;
};
