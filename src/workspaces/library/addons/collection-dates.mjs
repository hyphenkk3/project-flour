/** @typedef {{ id: string, name: string, status: string, startDate: string | null, endDate: string | null }} AddonCollection */

/** @param {Date} [now] */
export function getKuchingBusinessDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kuching", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year + "-" + values.month + "-" + values.day;
}

/** End dates are inclusive; status labels and creation dates do not determine history. @param {AddonCollection} collection @param {string} businessToday */
export function isAddonCollectionPast(collection, businessToday) {
  return collection.endDate !== null && collection.endDate < businessToday;
}

/** @param {AddonCollection[]} collections @param {string} businessToday */
export function partitionAddonCollections(collections, businessToday) {
  return {
    editable: collections.filter((collection) => !isAddonCollectionPast(collection, businessToday)),
    historical: collections.filter((collection) => isAddonCollectionPast(collection, businessToday)),
  };
}

/** Keep existing omitted and past assignment records exactly as stored. @template {Record<string, unknown>} T @param {T[]} existingAssignments @param {Set<string>} requestedCollectionIds @param {Map<string, AddonCollection>} collectionsById @param {string} businessToday */
export function assignmentsToPreserve(existingAssignments, requestedCollectionIds, collectionsById, businessToday) {
  return existingAssignments.filter((assignment) => {
    const id = String(assignment.collection_id ?? "");
    const collection = collectionsById.get(id);
    return !requestedCollectionIds.has(id) || !collection || isAddonCollectionPast(collection, businessToday);
  });
}
