export type LibraryAssetKind =
  | "homepage_hero"
  | "collection_cover"
  | "promotional_banner"
  | "cake_photo"
  | "general";

export type LibraryAssetStatus = "draft" | "active" | "retired";

export type LibraryAsset = {
  id: string;
  title: string;
  kind: LibraryAssetKind;
  imageUrl: string;
  altText: string | null;
  status: LibraryAssetStatus;
  createdAt: string;
  updatedAt: string;
};

export type LibraryAssetInput = {
  title: string;
  kind: LibraryAssetKind;
  imageUrl: string;
  altText: string | null;
  status: LibraryAssetStatus;
};
