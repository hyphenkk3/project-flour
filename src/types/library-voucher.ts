export type LibraryVoucherStatus =
  "draft" | "active" | "scheduled" | "expired" | "retired";

export type LibraryVoucherType =
  "fixed_amount" | "percentage" | "complimentary";

export type LibraryVoucher = {
  id: string;
  code: string;
  voucherType: LibraryVoucherType;
  value: number;
  validFrom: string | null;
  validUntil: string | null;
  imageUrl: string | null;
  assetId: string | null;
  status: LibraryVoucherStatus;
  createdAt: string;
  updatedAt: string;
};

export type LibraryVoucherInput = {
  code: string;
  voucherType: LibraryVoucherType;
  value: number;
  validFrom: string | null;
  validUntil: string | null;
  imageUrl: string | null;
  assetId: string | null;
  status: LibraryVoucherStatus;
};
