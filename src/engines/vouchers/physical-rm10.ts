/**
 * RM10 Physical Card library — management/visibility helpers.
 *
 * Does not change redemption eligibility, expiry checks, or duplicate-use
 * rejection. Used status is derived from effective rm10_physical_card
 * adjustments, never from a manual flag.
 */

import { physicalVoucherNumberFromMetadata } from "@/engines/orders/promotions";
import type {
  Rm10LibraryCard,
  Rm10LibraryFilterStatus,
  Rm10LibraryRedemption,
  Rm10LibraryRow,
  Rm10LibrarySource,
  Rm10LibraryStatus,
  Rm10LibrarySummary,
} from "@/types/rm10-physical-voucher";

export const RM10_LIBRARY_MAX_BATCH = 500;

export const RM10_VOUCHER_NUMBER_REQUIRED = "Voucher number is required.";
export const RM10_EXPIRY_REQUIRED = "Expiry date is required.";
export const RM10_RANGE_DIGITS_REQUIRED =
  "Starting and ending voucher numbers must be digits only.";
export const RM10_RANGE_ORDER_REQUIRED =
  "Ending number must be on or after the starting number.";
export const RM10_BATCH_LIMIT_EXCEEDED =
  "A batch can create at most 500 vouchers.";
export const RM10_LIST_REQUIRED = "Paste at least one voucher number.";
export const RM10_UNAUTHORIZED =
  "Only Owner and Manager can manage RM10 Physical Cards.";

/** Matches public.normalize_physical_voucher_number: trim, strip spaces, upper. */
export function normalizePhysicalVoucherNumber(
  value: string | null | undefined,
): string | null {
  const normalized = String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

export function parseRequiredExpiryDate(
  value: FormDataEntryValue | null,
): string | null {
  const text = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return null;
  }
  return text;
}

export function parseSingleVoucherNumber(
  value: FormDataEntryValue | null,
): { voucherNumber: string; normalized: string } | string {
  const raw = String(value ?? "").trim();
  const normalized = normalizePhysicalVoucherNumber(raw);
  if (!normalized) {
    return RM10_VOUCHER_NUMBER_REQUIRED;
  }
  return { voucherNumber: raw.replace(/\s+/g, ""), normalized };
}

export function parseVoucherNumberRange(
  startValue: FormDataEntryValue | null,
  endValue: FormDataEntryValue | null,
): { voucherNumber: string; normalized: string }[] | string {
  const start = String(startValue ?? "").trim();
  const end = String(endValue ?? "").trim();
  if (!start || !end) {
    return RM10_VOUCHER_NUMBER_REQUIRED;
  }
  if (!/^\d+$/.test(start) || !/^\d+$/.test(end)) {
    return RM10_RANGE_DIGITS_REQUIRED;
  }

  const startNum = BigInt(start);
  const endNum = BigInt(end);
  if (endNum < startNum) {
    return RM10_RANGE_ORDER_REQUIRED;
  }

  const count = Number(endNum - startNum) + 1;
  if (count > RM10_LIBRARY_MAX_BATCH) {
    return RM10_BATCH_LIMIT_EXCEEDED;
  }

  const width = start.length;
  const numbers: { voucherNumber: string; normalized: string }[] = [];
  const step = BigInt(1);
  for (let n = startNum; n <= endNum; n += step) {
    const voucherNumber = n.toString().padStart(width, "0");
    const normalized = normalizePhysicalVoucherNumber(voucherNumber);
    if (!normalized) {
      return RM10_VOUCHER_NUMBER_REQUIRED;
    }
    numbers.push({ voucherNumber, normalized });
  }
  return numbers;
}

export function parseVoucherNumberList(
  value: FormDataEntryValue | null,
): { voucherNumber: string; normalized: string }[] | string {
  const lines = String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return RM10_LIST_REQUIRED;
  }
  if (lines.length > RM10_LIBRARY_MAX_BATCH) {
    return RM10_BATCH_LIMIT_EXCEEDED;
  }

  const numbers: { voucherNumber: string; normalized: string }[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const normalized = normalizePhysicalVoucherNumber(line);
    if (!normalized) {
      return RM10_VOUCHER_NUMBER_REQUIRED;
    }
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    numbers.push({ voucherNumber: line.replace(/\s+/g, ""), normalized });
  }

  if (numbers.length === 0) {
    return RM10_LIST_REQUIRED;
  }

  return numbers;
}

export function planRm10PhysicalVoucherInserts(
  requested: { voucherNumber: string; normalized: string }[],
  existingNormalized: Iterable<string>,
): {
  toCreate: { voucherNumber: string; normalized: string }[];
  alreadyExist: string[];
} {
  const existing = new Set(
    [...existingNormalized]
      .map((value) => normalizePhysicalVoucherNumber(value))
      .filter((value): value is string => Boolean(value)),
  );
  const toCreate: { voucherNumber: string; normalized: string }[] = [];
  const alreadyExist: string[] = [];
  const planned = new Set<string>();

  for (const item of requested) {
    if (existing.has(item.normalized) || planned.has(item.normalized)) {
      alreadyExist.push(item.voucherNumber);
      continue;
    }
    planned.add(item.normalized);
    toCreate.push(item);
  }

  return { toCreate, alreadyExist };
}

export function formatAlreadyExistMessage(existing: string[]): string {
  if (existing.length === 1) {
    return `Voucher number ${existing[0]} already exists.`;
  }
  return `These voucher numbers already exist and were not changed: ${existing.join(", ")}.`;
}

export function deriveRm10LibraryStatus(input: {
  used: boolean;
  expiryDate: string | null;
  today: string;
}): Rm10LibraryStatus {
  if (input.used) {
    return "used";
  }
  if (input.expiryDate && input.expiryDate < input.today) {
    return "expired";
  }
  return "available";
}

export function redemptionFromAdjustmentMetadata(
  metadata: Record<string, unknown> | null | undefined,
): { voucherNumber: string; expiryDate: string | null } | null {
  const voucherNumber = physicalVoucherNumberFromMetadata(metadata);
  if (!voucherNumber) {
    return null;
  }
  const rawExpiry = metadata?.expiry_date;
  const expiryDate =
    typeof rawExpiry === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawExpiry)
      ? rawExpiry
      : null;
  return { voucherNumber, expiryDate };
}

export function buildRm10LibraryRows(input: {
  managedCards: Rm10LibraryCard[];
  redemptions: Rm10LibraryRedemption[];
  today: string;
}): Rm10LibraryRow[] {
  const managedByNorm = new Map<string, Rm10LibraryCard>();
  for (const card of input.managedCards) {
    managedByNorm.set(card.voucherNumberNormalized, card);
  }

  const redemptionsByNorm = new Map<string, Rm10LibraryRedemption[]>();
  for (const redemption of input.redemptions) {
    const normalized = normalizePhysicalVoucherNumber(redemption.voucherNumber);
    if (!normalized) {
      continue;
    }
    const list = redemptionsByNorm.get(normalized) ?? [];
    list.push(redemption);
    redemptionsByNorm.set(normalized, list);
  }

  const rows: Rm10LibraryRow[] = [];

  for (const [normalized, redemptions] of redemptionsByNorm) {
    const managed = managedByNorm.get(normalized);
    const duplicateRedemption = redemptions.length > 1;
    for (const redemption of redemptions) {
      rows.push({
        key: `used:${redemption.adjustmentId}`,
        voucherNumber: managed?.voucherNumber ?? redemption.voucherNumber,
        voucherNumberNormalized: normalized,
        expiryDate: managed?.expiryDate ?? redemption.expiryDate,
        status: "used",
        source: managed ? "library" : "historical",
        duplicateRedemption,
        redemption,
      });
    }
  }

  for (const card of input.managedCards) {
    if (redemptionsByNorm.has(card.voucherNumberNormalized)) {
      continue;
    }
    rows.push({
      key: `managed:${card.id}`,
      voucherNumber: card.voucherNumber,
      voucherNumberNormalized: card.voucherNumberNormalized,
      expiryDate: card.expiryDate,
      status: deriveRm10LibraryStatus({
        used: false,
        expiryDate: card.expiryDate,
        today: input.today,
      }),
      source: "library",
      duplicateRedemption: false,
      redemption: null,
    });
  }

  rows.sort((left, right) => {
    const numberCmp = left.voucherNumberNormalized.localeCompare(
      right.voucherNumberNormalized,
    );
    if (numberCmp !== 0) {
      return numberCmp;
    }
    return left.key.localeCompare(right.key);
  });

  return rows;
}

export function summarizeRm10Library(rows: Rm10LibraryRow[]): Rm10LibrarySummary {
  const available = new Set<string>();
  const used = new Set<string>();
  const expired = new Set<string>();
  const countedAdjustments = new Set<string>();
  let usedValue = 0;

  for (const row of rows) {
    if (row.status === "available") {
      available.add(row.voucherNumberNormalized);
    } else if (row.status === "used") {
      used.add(row.voucherNumberNormalized);
    } else {
      expired.add(row.voucherNumberNormalized);
    }

    if (
      row.status === "used" &&
      row.redemption &&
      !countedAdjustments.has(row.redemption.adjustmentId)
    ) {
      countedAdjustments.add(row.redemption.adjustmentId);
      usedValue += row.redemption.discountAmount;
    }
  }

  return {
    total: available.size + used.size + expired.size,
    available: available.size,
    used: used.size,
    expired: expired.size,
    usedValue,
  };
}

export function filterRm10LibraryRows(
  rows: Rm10LibraryRow[],
  input: { query?: string; status?: Rm10LibraryFilterStatus },
): Rm10LibraryRow[] {
  const query = input.query?.trim().toLowerCase() ?? "";
  const status = input.status ?? "all";

  return rows.filter((row) => {
    if (status !== "all" && row.status !== status) {
      return false;
    }
    if (!query) {
      return true;
    }
    const haystack = [
      row.voucherNumber,
      row.voucherNumberNormalized,
      row.redemption?.orderNumber ?? "",
      row.redemption?.customerName ?? "",
    ]
      .join("\n")
      .toLowerCase();
    return haystack.includes(query);
  });
}

export function findRm10LibraryRowsByNumber(
  rows: Rm10LibraryRow[],
  voucherNumber: string,
): Rm10LibraryRow[] {
  const normalized = normalizePhysicalVoucherNumber(voucherNumber);
  if (!normalized) {
    return [];
  }
  return rows.filter((row) => row.voucherNumberNormalized === normalized);
}

export function rm10LibraryStatusLabel(status: Rm10LibraryStatus): string {
  switch (status) {
    case "available":
      return "Available";
    case "used":
      return "Used";
    case "expired":
      return "Expired";
  }
}

export function rm10LibrarySourceLabel(source: Rm10LibrarySource): string {
  return source === "historical" ? "Historical" : "Library";
}
