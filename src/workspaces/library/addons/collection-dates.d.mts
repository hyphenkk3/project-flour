export type AddonCollection = {
  id: string;
  name: string;
  status: string;
  purpose: string | null;
  month: string | null;
  startDate: string | null;
  endDate: string | null;
};

export type AddonCollectionClassification = {
  state: "editable" | "historical" | "ambiguous";
  startDate: string | null;
  endDate: string | null;
  reason: string | null;
};

export function getKuchingBusinessDate(now?: Date): string;
export function classifyAddonCollection(collection: AddonCollection, businessToday: string): AddonCollectionClassification;
export function getAddonCollectionBusinessRange(collection: AddonCollection): { startDate: string; endDate: string } | null;
export function isAddonCollectionPast(collection: AddonCollection, businessToday: string): boolean;
export function partitionAddonCollections(collections: AddonCollection[], businessToday: string): { editable: AddonCollection[]; historical: AddonCollection[]; ambiguous: AddonCollection[] };
export function assignmentsToPreserve<T extends Record<string, unknown>>(existingAssignments: T[], requestedCollectionIds: Set<string>, collectionsById: Map<string, AddonCollection>, businessToday: string): T[];
export function requestedCollectionsAreEditable(requestedCollectionIds: string[], collectionsById: Map<string, AddonCollection>, businessToday: string): boolean;
