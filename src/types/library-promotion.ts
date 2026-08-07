export type LibraryPromotionStatus =
  "draft" | "active" | "scheduled" | "expired" | "retired";

export type LibraryPromotion = {
  id: string;
  name: string;
  description: string | null;
  validFrom: string | null;
  validUntil: string | null;
  status: LibraryPromotionStatus;
  createdAt: string;
  updatedAt: string;
};

export type LibraryPromotionInput = {
  name: string;
  description: string | null;
  validFrom: string | null;
  validUntil: string | null;
  status: LibraryPromotionStatus;
};
