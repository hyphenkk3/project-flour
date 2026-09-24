export type Rm10LibraryStatus = "available" | "used" | "expired";

export type Rm10LibrarySource = "library" | "historical";

export type Rm10LibraryRedemption = {
  adjustmentId: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  orderDate: string;
  redeemedDate: string;
  fulfilmentDate: string | null;
  fulfilmentMethodLabel: string | null;
  discountAmount: number;
  voucherNumber: string;
  expiryDate: string | null;
  ownerOverride: boolean;
  overrideByName: string | null;
};

export type Rm10LibraryCard = {
  id: string;
  voucherNumber: string;
  voucherNumberNormalized: string;
  expiryDate: string | null;
};

export type Rm10LibraryRow = {
  key: string;
  voucherNumber: string;
  voucherNumberNormalized: string;
  expiryDate: string | null;
  status: Rm10LibraryStatus;
  source: Rm10LibrarySource;
  duplicateRedemption: boolean;
  usedAfterExpiry: boolean;
  redemption: Rm10LibraryRedemption | null;
};

export type Rm10LibrarySummary = {
  total: number;
  available: number;
  used: number;
  expired: number;
  usedValue: number;
};

export type Rm10LibraryFilterStatus = "all" | Rm10LibraryStatus;
