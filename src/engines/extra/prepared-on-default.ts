/**
 * EXTRA v1.1 — Calendar-assisted proposal prepared_on default.
 *
 * Fulfilment/pickup_date is a business calendar YYYY-MM-DD (Singapore date axis).
 * Default prepared_on = that date minus one calendar day.
 * No closed-day / previous-open-business-day intelligence.
 */

import { parseBusinessDate } from "@/lib/dates";

function formatYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Returns YYYY-MM-DD one calendar day before the fulfilment date,
 * or null when fulfilmentYmd is not a valid business date.
 */
export function defaultPreparedOnFromFulfilmentDate(
  fulfilmentYmd: string,
): string | null {
  const date = parseBusinessDate(fulfilmentYmd);
  if (!date) return null;
  date.setDate(date.getDate() - 1);
  return formatYmd(date);
}

export type CalendarExtraProposePrefill = {
  cakeName: string;
  sizeLabel: string;
  libraryCakeId: string | null;
  libraryCakeSizeId: string | null;
  preparedOn: string | null;
};

/**
 * Prefill for Calendar → Propose EXTRA (one physical unit per submit).
 * Order-item quantity is ignored — context only.
 */
export function buildCalendarExtraProposePrefill(input: {
  cakeName: string;
  sizeLabel: string;
  cakeId?: string | null;
  cakeSizeId?: string | null;
  fulfilmentDateYmd: string;
}): CalendarExtraProposePrefill {
  const cakeName = input.cakeName.trim() || "Cake";
  const sizeLabel = input.sizeLabel.trim() || "Size";
  const libraryCakeId = input.cakeId?.trim() || null;
  const libraryCakeSizeId = input.cakeSizeId?.trim() || null;
  return {
    cakeName,
    sizeLabel,
    libraryCakeId,
    libraryCakeSizeId,
    preparedOn: defaultPreparedOnFromFulfilmentDate(input.fulfilmentDateYmd),
  };
}
