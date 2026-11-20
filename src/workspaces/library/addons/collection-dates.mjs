/** @typedef {{ id: string, name: string, status: string, purpose: string | null, month: string | null, startDate: string | null, endDate: string | null }} AddonCollection */
/** @typedef {{ state: "editable" | "historical" | "ambiguous", startDate: string | null, endDate: string | null, reason: string | null }} AddonCollectionClassification */

const TIME_ZONE = "Asia/Kuching";

/** @param {Date} [now] */
export function getKuchingBusinessDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year + "-" + values.month + "-" + values.day;
}

/** @param {unknown} value */
function isValidDateKey(value) {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** @param {string} month */
function monthlyEndDate(month) {
  const match = /^(\d{4})-(\d{2})-01$/.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (year < 1 || monthNumber < 1 || monthNumber > 12) return null;
  const last = new Date(0);
  last.setUTCHours(0, 0, 0, 0);
  last.setUTCFullYear(year, monthNumber, 0);
  const day = String(last.getUTCDate()).padStart(2, "0");
  return match[1] + "-" + match[2] + "-" + day;
}

/** Resolve the collection's authoritative business-date schedule. */
function getCollectionSchedule(collection) {
  if (collection.purpose === "monthly") {
    const month = collection.month;
    if (!month || !monthlyEndDate(month)) {
      return { startDate: null, endDate: null, reason: "Monthly collection has no valid first-of-month schedule date." };
    }
    // Monthly catalogues are scheduled by collections.month. Their nullable
    // start_date/end_date columns are not the monthly schedule.
    return { startDate: month, endDate: monthlyEndDate(month), reason: null };
  }

  if (collection.purpose === "special") {
    if (collection.month !== null) {
      return { startDate: null, endDate: null, reason: "Special collection has conflicting monthly and date-range schedule fields." };
    }
    const startDate = collection.startDate;
    const endDate = collection.endDate;
    if (!isValidDateKey(startDate) || !isValidDateKey(endDate)) {
      return { startDate: null, endDate: null, reason: "Special collection is missing a complete, valid start and end date." };
    }
    if (endDate < startDate) {
      return { startDate: null, endDate: null, reason: "Special collection end date precedes its start date." };
    }
    return { startDate, endDate, reason: null };
  }

  return { startDate: null, endDate: null, reason: "Collection purpose is missing or unrecognized, so its schedule cannot be determined safely." };
}

/** @param {AddonCollection} collection @param {string} businessToday */
export function classifyAddonCollection(collection, businessToday) {
  if (!isValidDateKey(businessToday)) {
    return { state: "ambiguous", startDate: null, endDate: null, reason: "The Asia/Kuching business date is unavailable or invalid." };
  }
  const schedule = getCollectionSchedule(collection);
  if (schedule.reason) {
    return { state: "ambiguous", startDate: schedule.startDate, endDate: schedule.endDate, reason: schedule.reason };
  }
  return {
    state: schedule.endDate < businessToday ? "historical" : "editable",
    startDate: schedule.startDate,
    endDate: schedule.endDate,
    reason: null,
  };
}

/** @param {AddonCollection} collection */
export function getAddonCollectionBusinessRange(collection) {
  const schedule = getCollectionSchedule(collection);
  return schedule.reason ? null : { startDate: schedule.startDate, endDate: schedule.endDate };
}

/** Compatibility helper for callers that only need a definitive ended check. @param {AddonCollection} collection @param {string} businessToday */
export function isAddonCollectionPast(collection, businessToday) {
  return classifyAddonCollection(collection, businessToday).state === "historical";
}

/** @param {AddonCollection[]} collections @param {string} businessToday */
export function partitionAddonCollections(collections, businessToday) {
  const result = { editable: [], historical: [], ambiguous: [] };
  for (const collection of collections) {
    const classification = classifyAddonCollection(collection, businessToday);
    if (classification.state === "historical") result.historical.push(collection);
    else if (classification.state === "ambiguous") result.ambiguous.push(collection);
    else result.editable.push(collection);
  }
  return result;
}

/** @template {Record<string, unknown>} T @param {T[]} existingAssignments @param {Set<string>} requestedCollectionIds @param {Map<string, AddonCollection>} collectionsById @param {string} businessToday */
export function assignmentsToPreserve(existingAssignments, requestedCollectionIds, collectionsById, businessToday) {
  return existingAssignments.filter((assignment) => {
    const id = String(assignment.collection_id ?? "");
    const collection = collectionsById.get(id);
    return !requestedCollectionIds.has(id) || !collection || classifyAddonCollection(collection, businessToday).state !== "editable";
  });
}

/** @param {string[]} requestedCollectionIds @param {Map<string, AddonCollection>} collectionsById @param {string} businessToday */
export function requestedCollectionsAreEditable(requestedCollectionIds, collectionsById, businessToday) {
  return requestedCollectionIds.every((id) => {
    const collection = collectionsById.get(id);
    return collection !== undefined && classifyAddonCollection(collection, businessToday).state === "editable";
  });
}
