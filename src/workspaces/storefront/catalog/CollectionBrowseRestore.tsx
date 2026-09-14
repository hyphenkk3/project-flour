"use client";

import { StorefrontListingRestore } from "@/workspaces/storefront/catalog/StorefrontListingRestore";

type CollectionBrowseRestoreProps = {
  collectionId: string;
};

export function CollectionBrowseRestore({
  collectionId,
}: CollectionBrowseRestoreProps) {
  return (
    <StorefrontListingRestore collectionId={collectionId} origin="collection" />
  );
}
