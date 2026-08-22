import {
  formatLibraryCollectionMonth,
  LIBRARY_COLLECTION_STATUSES,
  type LibraryCollectionStatus,
} from "@/workspaces/library/labels";
import {
  businessYearMonth,
  formatBusinessCalendarDate,
  parseBusinessDate,
  toBusinessDateKey,
} from "@/lib/dates";

export const CATALOGUE_PURPOSES = ["monthly", "special"] as const;

export type CataloguePurpose = (typeof CATALOGUE_PURPOSES)[number];

export const WEBSITE_OVERRIDE_EXPLANATION =
  "When published, this catalogue temporarily replaces the monthly website catalogue during its date range. The monthly catalogue returns automatically afterwards.";

export const COPY_FROM_PREVIOUS_LABEL = "Copy from previous catalogue";
export const COPY_FROM_EXPLANATION =
  "Start with the cakes and ordering from an existing monthly catalogue. You can change them after copying.";
export const COPY_FROM_EMPTY_LABEL = "Start empty";
export const CATALOGUE_COPIED_QUERY = "copied";
export const CATALOGUE_PUBLISHED_QUERY = "published";
export const CATALOGUE_UNPUBLISHED_QUERY = "unpublished";
export const CATALOGUE_UPDATED_QUERY = "updated";
export const CATALOGUE_ARCHIVED_QUERY = "archived";
export const CATALOGUE_RESTORED_QUERY = "restored";
export const CATALOGUE_ARCHIVE_CONFIRMATION =
  "Archive this catalogue? It will no longer appear in the active catalogue list or customer ordering. Existing orders and catalogue history will be preserved.";
export const SHOW_IN_PAST_MENU_LABEL = "Show in Browse Menu";
export const SHOW_IN_PAST_MENU_EXPLANATION =
  "When this catalogue is no longer current, show it to customers as a historical, view-only Past Menu. This does not make it orderable.";
export const CATALOGUE_PAST_MENU_QUERY = "past-menu";

export function parseShowInPastMenuFlag(
  value: FormDataEntryValue | null,
): boolean {
  const raw = String(value ?? "").toLowerCase();
  return raw === "true" || raw === "on" || raw === "1";
}

/** Current Singapore month plus the next 12 months. */
export const CATALOGUE_MONTH_OPTION_COUNT = 13;

const COPY_FROM_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CatalogueCopyFrom =
  | { kind: "empty" }
  | { kind: "id"; id: string }
  | { kind: "invalid" };

export type MonthlyCopySource = {
  id: string;
  name: string;
  month: string;
  createdAt: string;
  purpose: CataloguePurpose;
};

export type CatalogueMembershipSnapshot = {
  libraryCakeId: string;
  available: boolean;
  sortOrder: number;
};

export type CatalogueCreateInput = {
  name: string;
  purpose: CataloguePurpose;
  status: LibraryCollectionStatus;
  month: string | null;
  startDate: string | null;
  endDate: string | null;
  websiteOverride: boolean;
};

export type CatalogueDateView = {
  name: string;
  purpose: CataloguePurpose;
  month: string | null;
  startDate: string | null;
  endDate: string | null;
  websiteOverride?: boolean;
};

export type WebsiteOverrideConflict = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
};

export function cataloguePurposeLabel(purpose: CataloguePurpose): string {
  switch (purpose) {
    case "monthly":
      return "Monthly";
    case "special":
      return "Special occasion";
  }
}

export function catalogueMonthOptions(
  fromYmd: string = toBusinessDateKey(),
  monthCount = CATALOGUE_MONTH_OPTION_COUNT,
): Array<{
  value: string;
  label: string;
}> {
  const start = businessYearMonth(fromYmd);
  if (!start) return [];
  const count = Math.max(1, monthCount);
  const options: Array<{ value: string; label: string }> = [];
  for (let offset = 0; offset < count; offset += 1) {
    const value = shiftCatalogueYearMonth(start, offset);
    options.push({
      value,
      label: formatLibraryCollectionMonth(`${value}-01`),
    });
  }
  return options;
}

function shiftCatalogueYearMonth(yearMonth: string, delta: number): string {
  const date = parseBusinessDate(`${yearMonth}-01`);
  if (!date) return yearMonth;
  date.setMonth(date.getMonth() + delta);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function parseCatalogueMonthDate(value: string): string | null {
  const trimmed = value.trim();
  const key = trimmed.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(key)) {
    return null;
  }
  const [year, monthNum] = key.split("-").map(Number);
  if (!year || !monthNum || monthNum < 1 || monthNum > 12) {
    return null;
  }
  return `${key}-01`;
}

export function parseCatalogueCalendarDate(value: string): string | null {
  const text = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return null;
  }
  const [year, monthNum, day] = text.split("-").map(Number);
  const utc = new Date(Date.UTC(year, monthNum - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== monthNum - 1 ||
    utc.getUTCDate() !== day
  ) {
    return null;
  }
  return text;
}

export function formatCatalogueCalendarDate(iso: string): string {
  const text = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return iso;
  }
  return formatBusinessCalendarDate(text);
}

export function formatCatalogueDateRange(start: string, end: string): string {
  const from = formatCatalogueCalendarDate(start);
  const to = formatCatalogueCalendarDate(end);
  if (from === to) {
    return from;
  }
  return `${from} → ${to}`;
}

export function parseCatalogueDetailsInput(
  formData: FormData,
): { name: string } | string {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return "Name is required.";
  }
  return { name };
}

export function isArchivedCatalogueStatus(status: string): boolean {
  return status === "archived";
}

export function catalogueArchiveBlockedMessage(
  status: string,
): string | null {
  if (status === "active") {
    return "Unpublish this catalogue before archiving. Active catalogues stay available to customers until unpublished.";
  }
  if (status === "archived") {
    return "This catalogue is already archived.";
  }
  return null;
}

export function parseCatalogueCreateInput(
  formData: FormData,
): CatalogueCreateInput | string {
  const name = String(formData.get("name") ?? "").trim();
  const purpose = String(formData.get("purpose") ?? "").trim();
  const status = String(formData.get("status") ?? "draft").trim();

  if (!name) {
    return "Name is required.";
  }
  if (!CATALOGUE_PURPOSES.includes(purpose as CataloguePurpose)) {
    return "Choose Monthly or Special occasion.";
  }
  if (
    !LIBRARY_COLLECTION_STATUSES.includes(status as LibraryCollectionStatus)
  ) {
    return "Choose a valid status.";
  }

  const websiteOverrideRaw = String(
    formData.get("website_override") ?? "",
  ).toLowerCase();
  const websiteOverrideRequested =
    websiteOverrideRaw === "true" ||
    websiteOverrideRaw === "on" ||
    websiteOverrideRaw === "1";

  if (purpose === "monthly") {
    const month = parseCatalogueMonthDate(String(formData.get("month") ?? ""));
    if (!month) {
      return "Choose a month.";
    }
    return {
      name,
      purpose: "monthly",
      status: status as LibraryCollectionStatus,
      month,
      startDate: null,
      endDate: null,
      websiteOverride: false,
    };
  }

  const startRaw = String(formData.get("start_date") ?? "").trim();
  const endRaw = String(formData.get("end_date") ?? "").trim();
  if (!startRaw) {
    return "Start date is required.";
  }
  if (!endRaw) {
    return "End date is required.";
  }
  const startDate = parseCatalogueCalendarDate(startRaw);
  const endDate = parseCatalogueCalendarDate(endRaw);
  if (!startDate) {
    return "Start date is invalid.";
  }
  if (!endDate) {
    return "End date is invalid.";
  }
  if (endDate < startDate) {
    return "End date must not be before start date.";
  }

  return {
    name,
    purpose: "special",
    status: status as LibraryCollectionStatus,
    month: null,
    startDate,
    endDate,
    websiteOverride: websiteOverrideRequested,
  };
}

export function catalogueInsertRow(parsed: CatalogueCreateInput): {
  name: string;
  purpose: CataloguePurpose;
  status: LibraryCollectionStatus;
  month: string | null;
  start_date?: string | null;
  end_date?: string | null;
  website_override?: boolean;
} {
  if (parsed.purpose === "monthly") {
    return {
      name: parsed.name,
      purpose: "monthly",
      status: parsed.status,
      month: parsed.month,
    };
  }
  return {
    name: parsed.name,
    purpose: "special",
    status: parsed.status,
    month: null,
    start_date: parsed.startDate,
    end_date: parsed.endDate,
    website_override: parsed.websiteOverride,
  };
}

export function catalogueDateRangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export function findOverlappingWebsiteOverride(
  candidate: { startDate: string; endDate: string; excludeId?: string },
  published: WebsiteOverrideConflict[],
): WebsiteOverrideConflict | null {
  for (const other of published) {
    if (candidate.excludeId && other.id === candidate.excludeId) {
      continue;
    }
    if (
      catalogueDateRangesOverlap(
        candidate.startDate,
        candidate.endDate,
        other.startDate,
        other.endDate,
      )
    ) {
      return other;
    }
  }
  return null;
}

export function websiteOverrideConflictMessage(
  conflict: WebsiteOverrideConflict,
): string {
  return (
    `Cannot publish as a website override: the date range overlaps “${conflict.name}” ` +
    `(${formatCatalogueDateRange(conflict.startDate, conflict.endDate)}). ` +
    "Turn that override off first."
  );
}

export function catalogueDisplayTitle(input: CatalogueDateView): string {
  if (input.purpose === "monthly" && input.month) {
    return formatLibraryCollectionMonth(input.month);
  }
  return input.name;
}

export function catalogueDateLine(input: CatalogueDateView): string | null {
  if (input.purpose === "monthly" && input.month) {
    return `Month: ${formatLibraryCollectionMonth(input.month)}`;
  }
  if (input.purpose === "special" && input.startDate && input.endDate) {
    return formatCatalogueDateRange(input.startDate, input.endDate);
  }
  return null;
}

export function catalogueSupportingLine(
  input: CatalogueDateView,
): string | null {
  const title = catalogueDisplayTitle(input);
  if (input.purpose === "monthly" && input.name && input.name !== title) {
    return input.name;
  }
  return null;
}

export function isStorefrontEligiblePurpose(
  purpose: CataloguePurpose,
): boolean {
  return purpose === "monthly";
}

export function isPublishedSpecialWebsiteOverride(input: {
  purpose: CataloguePurpose;
  websiteOverride?: boolean;
}): boolean {
  return input.purpose === "special" && input.websiteOverride === true;
}

export function parseCatalogueCopyFrom(
  formData: FormData,
): CatalogueCopyFrom {
  return parseCatalogueCopyFromValue(String(formData.get("copy_from") ?? ""));
}

export function parseCatalogueCopyFromValue(raw: string): CatalogueCopyFrom {
  const value = raw.trim();
  if (!value) return { kind: "empty" };
  if (!COPY_FROM_ID.test(value)) return { kind: "invalid" };
  return { kind: "id", id: value };
}

export function catalogueCopySelectionError(
  purpose: CataloguePurpose,
  copyFrom: CatalogueCopyFrom,
): string | null {
  if (copyFrom.kind === "empty") return null;
  if (purpose !== "monthly") {
    return "Copy from previous catalogue is only for monthly catalogues.";
  }
  if (copyFrom.kind === "invalid") {
    return "Choose a monthly catalogue to copy, or start empty.";
  }
  return null;
}

export function monthlyCopySources<T extends MonthlyCopySource>(
  catalogues: readonly T[],
): T[] {
  return catalogues
    .filter((catalogue) => catalogue.purpose === "monthly" && catalogue.month)
    .slice()
    .sort((a, b) => {
      const monthCmp = b.month.localeCompare(a.month);
      if (monthCmp !== 0) return monthCmp;
      return b.createdAt.localeCompare(a.createdAt);
    });
}

export function monthlyCopySourceLabel(source: {
  name: string;
  month: string;
}): string {
  const monthLabel = formatLibraryCollectionMonth(source.month);
  if (source.name && source.name !== monthLabel) {
    return `${monthLabel} — ${source.name}`;
  }
  return monthLabel;
}

export function findMonthlyCatalogueForMonth(
  month: string,
  catalogues: readonly {
    id: string;
    purpose: CataloguePurpose | string;
    month: string | null;
  }[],
): { id: string } | null {
  const target = month.slice(0, 10);
  const found = catalogues.find(
    (catalogue) =>
      catalogue.purpose === "monthly" &&
      String(catalogue.month ?? "").slice(0, 10) === target,
  );
  return found ? { id: found.id } : null;
}

export function duplicateMonthlyMonthMessage(month: string): string {
  return `A monthly catalogue for ${formatLibraryCollectionMonth(month)} already exists.`;
}

export type CatalogueDisplayOrderInput = {
  id: string;
  month: string | null;
  startDate: string | null;
  createdAt: string;
  isCurrentStorefront: boolean;
};

/**
 * Legacy Library Catalogues order: current website catalogue first, then
 * remaining by month desc, start date desc, created_at desc.
 * Used only to seed display_order so applying the column does not reshuffle cards.
 */
export function compareCataloguesForLegacyDisplayOrder(
  a: CatalogueDisplayOrderInput,
  b: CatalogueDisplayOrderInput,
): number {
  if (a.isCurrentStorefront !== b.isCurrentStorefront) {
    return a.isCurrentStorefront ? -1 : 1;
  }
  const monthA = a.month ?? "";
  const monthB = b.month ?? "";
  if (monthA !== monthB) {
    if (!monthA) return 1;
    if (!monthB) return -1;
    return monthB.localeCompare(monthA);
  }
  const startA = a.startDate ?? "";
  const startB = b.startDate ?? "";
  if (startA !== startB) {
    if (!startA) return 1;
    if (!startB) return -1;
    return startB.localeCompare(startA);
  }
  if (a.createdAt !== b.createdAt) {
    return b.createdAt.localeCompare(a.createdAt);
  }
  return a.id.localeCompare(b.id);
}

export function initialCatalogueDisplayOrders(
  catalogues: readonly CatalogueDisplayOrderInput[],
): Array<{ id: string; displayOrder: number }> {
  return [...catalogues]
    .sort(compareCataloguesForLegacyDisplayOrder)
    .map((catalogue, index) => ({ id: catalogue.id, displayOrder: index }));
}

export function nextCatalogueDisplayOrder(
  existing: readonly number[],
): number {
  if (existing.length === 0) return 0;
  return Math.max(...existing) + 1;
}

export function reorderCatalogueIds(
  ids: readonly string[],
  movedId: string,
  targetIndex: number,
): string[] {
  const next = [...ids];
  const fromIndex = next.indexOf(movedId);
  if (fromIndex < 0) return next;
  const [item] = next.splice(fromIndex, 1);
  if (!item) return [...ids];
  const clamped = Math.max(0, Math.min(targetIndex, next.length));
  next.splice(clamped, 0, item);
  return next;
}

export function displayOrdersFromIds(
  ids: readonly string[],
): Array<{ id: string; displayOrder: number }> {
  return ids.map((id, index) => ({ id, displayOrder: index }));
}

export function sortByCatalogueDisplayOrder<
  T extends { id: string; displayOrder: number | null },
>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.displayOrder == null && b.displayOrder == null) {
      return a.id.localeCompare(b.id);
    }
    if (a.displayOrder == null) return 1;
    if (b.displayOrder == null) return -1;
    if (a.displayOrder !== b.displayOrder) {
      return a.displayOrder - b.displayOrder;
    }
    return a.id.localeCompare(b.id);
  });
}

export function copyCatalogueMembershipRows(
  source: readonly CatalogueMembershipSnapshot[],
): CatalogueMembershipSnapshot[] {
  const seen = new Set<string>();
  const copied: CatalogueMembershipSnapshot[] = [];
  for (const row of source) {
    if (!row.libraryCakeId || seen.has(row.libraryCakeId)) continue;
    seen.add(row.libraryCakeId);
    copied.push({
      libraryCakeId: row.libraryCakeId,
      available: row.available,
      sortOrder: row.sortOrder,
    });
  }
  return copied;
}
