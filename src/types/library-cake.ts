export type LibraryCakeStatus =
  "draft" | "ready_for_release" | "active" | "seasonal" | "retired";

export type LibraryCakeCategoryRecord = {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type LibraryCakeSize = {
  id: string;
  cakeId: string;
  label: string;
  price: number;
  sortOrder: number;
  preorderDays: number;
};

export type LibraryCakePhoto = {
  id: string;
  cakeId: string;
  assetId: string | null;
  imageUrl: string;
  altText: string | null;
  sortOrder: number;
  cakeSizeId: string | null;
  isDefault: boolean;
  storagePath: string | null;
};

export type LibraryCake = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  categoryActive: boolean;
  categorySortOrder: number;
  description: string | null;
  sharingGuide: string | null;
  allergens: string[];
  bakeryNotes: string | null;
  status: LibraryCakeStatus;
  createdAt: string;
  updatedAt: string;
  sizes: LibraryCakeSize[];
  /** Present when the list/detail query loaded library_cake_photos. */
  photos?: LibraryCakePhoto[];
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
  preorderDays: number;
};

export type LibraryCakePhotoInput = {
  imageUrl: string;
  altText: string | null;
  assetId: string | null;
  sortOrder: number;
  cakeSizeId?: string | null;
  isDefault?: boolean;
};

export type LibraryCakeInput = {
  name: string;
  categoryId: string;
  description: string | null;
  sharingGuide: string | null;
  allergens: string[];
  bakeryNotes: string | null;
  status: LibraryCakeStatus;
  sizes: LibraryCakeSizeInput[];
  photos: LibraryCakePhotoInput[];
};
