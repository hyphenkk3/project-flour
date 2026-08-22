import {
  sortLibraryCakes,
  type LibraryCakeSortId,
} from "@/engines/menu/cake-library-list";
import type { LibraryCake, LibraryCakeStatus } from "@/types/library-cake";

export type CollectionMembership = {
  id: string;
  libraryCakeId: string;
  available: boolean;
  sortOrder: number;
};

export type StorefrontCollectionEligibility = {
  collectionActive: boolean;
  isCurrentStorefront: boolean;
  membershipAvailable: boolean;
  libraryStatusEligible: boolean;
  hasSize: boolean;
};

const STOREFRONT_LIBRARY_STATUSES: readonly LibraryCakeStatus[] = [
  "active",
  "seasonal",
];

export function isStorefrontLibraryStatus(status: LibraryCakeStatus): boolean {
  return STOREFRONT_LIBRARY_STATUSES.includes(status);
}

export function collectionCakeStorefrontEligibility(input: {
  collectionStatus: string;
  isCurrentStorefront: boolean;
  available: boolean;
  cakeStatus: LibraryCakeStatus;
  sizeCount: number;
}): StorefrontCollectionEligibility {
  return {
    collectionActive: input.collectionStatus === "active",
    isCurrentStorefront: input.isCurrentStorefront,
    membershipAvailable: input.available,
    libraryStatusEligible: isStorefrontLibraryStatus(input.cakeStatus),
    hasSize: input.sizeCount > 0,
  };
}

export function isVisibleOnCustomerStorefront(
  eligibility: StorefrontCollectionEligibility,
): boolean {
  return (
    eligibility.isCurrentStorefront &&
    eligibility.collectionActive &&
    eligibility.membershipAvailable &&
    eligibility.libraryStatusEligible &&
    eligibility.hasSize
  );
}

export function storefrontVisibilityReason(
  eligibility: StorefrontCollectionEligibility,
): string {
  if (isVisibleOnCustomerStorefront(eligibility)) {
    return "Visible on the website";
  }
  if (!eligibility.isCurrentStorefront) {
    return "Hidden: not the current website catalogue";
  }
  if (!eligibility.collectionActive) {
    return "Hidden: catalogue is not active";
  }
  if (!eligibility.membershipAvailable) {
    return "Hidden: not marked available in this catalogue";
  }
  if (!eligibility.libraryStatusEligible) {
    return "Hidden: Library status is not Active or Seasonal";
  }
  return "Hidden: cake has no sizes";
}

export function addCollectionMembership(
  members: readonly CollectionMembership[],
  libraryCakeId: string,
): CollectionMembership[] {
  if (members.some((member) => member.libraryCakeId === libraryCakeId)) {
    throw new Error("This cake is already in the collection.");
  }
  const next: CollectionMembership = {
    id: `new-${libraryCakeId}`,
    libraryCakeId,
    available: true,
    sortOrder: members.length,
  };
  return resequenceCollectionMembership([...members, next]);
}

export function setCollectionMembershipAvailable(
  members: readonly CollectionMembership[],
  membershipId: string,
  available: boolean,
): CollectionMembership[] {
  return members.map((member) =>
    member.id === membershipId ? { ...member, available } : member,
  );
}

export function removeCollectionMembership(
  members: readonly CollectionMembership[],
  membershipId: string,
): CollectionMembership[] {
  return resequenceCollectionMembership(
    members.filter((member) => member.id !== membershipId),
  );
}

export function moveCollectionMembership(
  members: readonly CollectionMembership[],
  membershipId: string,
  direction: -1 | 1,
): CollectionMembership[] {
  const ordered = resequenceCollectionMembership([...members]);
  const index = ordered.findIndex((member) => member.id === membershipId);
  if (index < 0) {
    return ordered;
  }
  return moveCollectionMembershipTo(ordered, membershipId, index + direction);
}

export function moveCollectionMembershipTo(
  members: readonly CollectionMembership[],
  membershipId: string,
  targetIndex: number,
): CollectionMembership[] {
  const ordered = resequenceCollectionMembership([...members]);
  const fromIndex = ordered.findIndex((member) => member.id === membershipId);
  if (fromIndex < 0) {
    return ordered;
  }
  const next = [...ordered];
  const [item] = next.splice(fromIndex, 1);
  if (!item) {
    return ordered;
  }
  const clamped = Math.max(0, Math.min(targetIndex, next.length));
  next.splice(clamped, 0, item);
  return resequenceCollectionMembership(next);
}

export type CollectionBulkSortId =
  | "current"
  | "name_asc"
  | "name_desc"
  | "price_asc"
  | "price_desc"
  | "category_asc"
  | "category_desc";

export const COLLECTION_BULK_SORT_IDS: readonly CollectionBulkSortId[] = [
  "current",
  "name_asc",
  "name_desc",
  "price_asc",
  "price_desc",
  "category_asc",
  "category_desc",
] as const;

const LIBRARY_SORT_BY_BULK: Record<
  Exclude<CollectionBulkSortId, "current">,
  LibraryCakeSortId
> = {
  name_asc: "name_asc",
  name_desc: "name_desc",
  price_asc: "price_asc",
  price_desc: "price_desc",
  category_asc: "category_asc",
  category_desc: "category_desc",
};

export function collectionBulkSortLabel(sort: CollectionBulkSortId): string {
  switch (sort) {
    case "current":
      return "Current order";
    case "name_asc":
      return "Name A–Z";
    case "name_desc":
      return "Name Z–A";
    case "price_asc":
      return "Price low → high";
    case "price_desc":
      return "Price high → low";
    case "category_asc":
      return "Category A–Z";
    case "category_desc":
      return "Category Z–A";
  }
}

export function sortCollectionMembership(
  members: readonly CollectionMembership[],
  cakes: readonly LibraryCake[],
  sort: CollectionBulkSortId,
): CollectionMembership[] {
  if (sort === "current") {
    return resequenceCollectionMembership([...members]);
  }
  const cakeById = new Map(cakes.map((cake) => [cake.id, cake]));
  const present: LibraryCake[] = [];
  for (const member of members) {
    const cake = cakeById.get(member.libraryCakeId);
    if (cake) {
      present.push(cake);
    }
  }
  const sorted = sortLibraryCakes(present, LIBRARY_SORT_BY_BULK[sort]);
  const memberByCake = new Map(
    members.map((member) => [member.libraryCakeId, member]),
  );
  return resequenceCollectionMembership(
    sorted.flatMap((cake) => {
      const member = memberByCake.get(cake.id);
      return member ? [member] : [];
    }),
  );
}

export function dropIndexAfterRemoval(
  fromIndex: number,
  insertBefore: number,
): number {
  if (fromIndex < 0) {
    return insertBefore;
  }
  if (fromIndex < insertBefore) {
    return insertBefore - 1;
  }
  return insertBefore;
}

export function resequenceCollectionMembership(
  members: readonly CollectionMembership[],
): CollectionMembership[] {
  return members.map((member, index) => ({ ...member, sortOrder: index }));
}

export function cakesNotInCollection(
  cakes: readonly LibraryCake[],
  members: readonly { libraryCakeId: string }[],
): LibraryCake[] {
  const inCollection = new Set(members.map((member) => member.libraryCakeId));
  return cakes.filter((cake) => !inCollection.has(cake.id));
}
