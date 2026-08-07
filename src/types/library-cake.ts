export type LibraryCakeStatus =
  "draft" | "ready_for_release" | "active" | "seasonal" | "retired";

export type LibraryCakeCategory =
  "celebration" | "classic" | "seasonal" | "specialty" | "other";

export type LibraryCakeSize = {
  id: string;
  cakeId: string;
  label: string;
  price: number;
  sortOrder: number;
};

export type LibraryCakePhoto = {
  id: string;
  cakeId: string;
  assetId: string | null;
  imageUrl: string;
  altText: string | null;
  sortOrder: number;
};

export type LibraryCake = {
  id: string;
  name: string;
  category: LibraryCakeCategory;
  description: string | null;
  sharingGuide: string | null;
  allergens: string[];
  bakeryNotes: string | null;
  status: LibraryCakeStatus;
  createdAt: string;
  updatedAt: string;
  sizes: LibraryCakeSize[];
};

export type LibraryCakeDetail = LibraryCake & {
  photos: LibraryCakePhoto[];
};

export type LibraryCakeSizeInput = {
  /** Existing size id when editing; omit/null for newly added sizes. */
  id?: string | null;
  label: string;
  price: number;
  sortOrder: number;
};

export type LibraryCakePhotoInput = {
  imageUrl: string;
  altText: string | null;
  assetId: string | null;
  sortOrder: number;
};

export type LibraryCakeInput = {
  name: string;
  category: LibraryCakeCategory;
  description: string | null;
  sharingGuide: string | null;
  allergens: string[];
  bakeryNotes: string | null;
  status: LibraryCakeStatus;
  sizes: LibraryCakeSizeInput[];
  photos: LibraryCakePhotoInput[];
};
