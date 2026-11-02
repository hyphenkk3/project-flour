import type { AddonCollection } from "./types";
export function getKuchingBusinessDate(now?: Date): string;
export function isAddonCollectionPast(collection: AddonCollection, businessToday: string): boolean;
export function partitionAddonCollections(collections: AddonCollection[], businessToday: string): { editable: AddonCollection[]; historical: AddonCollection[] };
export function assignmentsToPreserve<T extends Record<string, unknown>>(existingAssignments: T[], requestedCollectionIds: Set<string>, collectionsById: Map<string, AddonCollection>, businessToday: string): T[];
