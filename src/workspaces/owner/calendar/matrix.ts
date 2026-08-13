import type { CalendarExtraMarker } from "@/engines/extra/calendar-visibility";
import type { CalendarEntry } from "@/workspaces/owner/calendar/types";

export type MatrixCustomerEntry = {
  orderId: string;
  displayName: string;
  customerName: string;
  quantity: number;
  pickupTime: string;
  fulfilmentMethod: CalendarEntry["fulfilmentMethod"];
  status: CalendarEntry["status"];
  needsBakeryAttention: boolean;
  hasEffectiveRm10: boolean;
  readyAt: string | null;
  pickedUpAt: string | null;
  outForDeliveryAt: string | null;
  deliveredAt: string | null;
};

export type MatrixCell = {
  totalQuantity: number;
  customers: MatrixCustomerEntry[];
  /** EXTRA units placed by prepared_on (not order customers). */
  extras: CalendarExtraMarker[];
};

export type MatrixRow = {
  key: string;
  cakeName: string;
  sizeLabel: string;
  label: string;
  cellsByDate: Record<string, MatrixCell>;
};

function rowKey(cakeName: string, sizeLabel: string): string {
  return `${cakeName}\u0000${sizeLabel}`;
}

/** Prefer numeric inch ordering (4", 6", 8") when parseable. */
function sizeSortKey(sizeLabel: string): [number, string] {
  const match = /(\d+(?:\.\d+)?)/.exec(sizeLabel);
  if (match) {
    return [Number(match[1]), sizeLabel];
  }
  return [Number.POSITIVE_INFINITY, sizeLabel];
}

function compareRows(a: MatrixRow, b: MatrixRow): number {
  const cakeCmp = a.cakeName.localeCompare(b.cakeName, "en", {
    sensitivity: "base",
  });
  if (cakeCmp !== 0) return cakeCmp;

  const [aNum, aLabel] = sizeSortKey(a.sizeLabel);
  const [bNum, bLabel] = sizeSortKey(b.sizeLabel);
  if (aNum !== bNum) return aNum - bNum;
  return aLabel.localeCompare(bLabel, "en", { sensitivity: "base" });
}

function compareCustomers(a: MatrixCustomerEntry, b: MatrixCustomerEntry): number {
  const timeCmp = a.pickupTime.localeCompare(b.pickupTime);
  if (timeCmp !== 0) return timeCmp;
  const nameCmp = a.customerName.localeCompare(b.customerName, "en", {
    sensitivity: "base",
  });
  if (nameCmp !== 0) return nameCmp;
  return a.displayName.localeCompare(b.displayName, "en", {
    sensitivity: "base",
  });
}

function compareExtras(a: CalendarExtraMarker, b: CalendarExtraMarker): number {
  const lifeCmp = a.lifecycle.localeCompare(b.lifecycle);
  if (lifeCmp !== 0) return lifeCmp;
  return a.id.localeCompare(b.id);
}

function ensureRow(
  rows: Map<string, MatrixRow>,
  cakeName: string,
  sizeLabel: string,
): MatrixRow {
  const key = rowKey(cakeName, sizeLabel);
  let row = rows.get(key);
  if (!row) {
    row = {
      key,
      cakeName,
      sizeLabel,
      label: `${cakeName} ${sizeLabel}`,
      cellsByDate: {},
    };
    rows.set(key, row);
  }
  return row;
}

function ensureCell(row: MatrixRow, ymd: string): MatrixCell {
  let cell = row.cellsByDate[ymd];
  if (!cell) {
    cell = { totalQuantity: 0, customers: [], extras: [] };
    row.cellsByDate[ymd] = cell;
  }
  return cell;
}

/**
 * Build Matrix rows from guest CalendarEntry month data + EXTRA markers.
 * Orders place on pickup_date; EXTRA places on prepared_on only.
 * Only includes dates in `dateYmids` (selected month).
 */
export function buildCalendarMatrix(
  entries: CalendarEntry[],
  dateYmids: string[],
  extras: CalendarExtraMarker[] = [],
): MatrixRow[] {
  const dateSet = new Set(dateYmids);
  const rows = new Map<string, MatrixRow>();

  for (const entry of entries) {
    if (entry.kind !== "order") continue;
    if (!dateSet.has(entry.pickupDate)) continue;

    for (const item of entry.items) {
      const cakeName = item.cakeName.trim() || "Cake";
      const sizeLabel = item.sizeLabel.trim() || "Size";
      const row = ensureRow(rows, cakeName, sizeLabel);
      const cell = ensureCell(row, entry.pickupDate);

      const qty = Math.max(1, Number(item.quantity) || 1);
      cell.totalQuantity += qty;

      const existing = cell.customers.find(
        (customer) => customer.orderId === entry.id,
      );
      if (existing) {
        existing.quantity += qty;
      } else {
        cell.customers.push({
          orderId: entry.id,
          displayName: entry.displayName,
          customerName: entry.customerName,
          quantity: qty,
          pickupTime: entry.pickupTime,
          fulfilmentMethod: entry.fulfilmentMethod,
          status: entry.status,
          needsBakeryAttention: entry.needsBakeryAttention,
          hasEffectiveRm10: entry.hasEffectiveRm10,
          readyAt: entry.readyAt,
          pickedUpAt: entry.pickedUpAt,
          outForDeliveryAt: entry.outForDeliveryAt,
          deliveredAt: entry.deliveredAt,
        });
      }
    }
  }

  for (const extra of extras) {
    if (!dateSet.has(extra.preparedOn)) continue;
    const cakeName = extra.cakeName.trim() || "Cake";
    const sizeLabel = extra.sizeLabel.trim() || "Size";
    const row = ensureRow(rows, cakeName, sizeLabel);
    const cell = ensureCell(row, extra.preparedOn);
    cell.extras.push(extra);
  }

  const result = Array.from(rows.values()).sort(compareRows);
  for (const row of result) {
    for (const cell of Object.values(row.cellsByDate)) {
      cell.customers.sort(compareCustomers);
      cell.extras.sort(compareExtras);
    }
  }
  return result;
}

export function matrixCellHasContent(cell: MatrixCell | undefined): boolean {
  if (!cell) return false;
  return cell.totalQuantity > 0 || cell.extras.length > 0;
}
