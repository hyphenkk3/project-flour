import type { CalendarEntry } from "@/workspaces/owner/calendar/types";

export type MatrixCustomerEntry = {
  orderId: string;
  displayName: string;
  customerName: string;
  quantity: number;
  pickupTime: string;
  status: CalendarEntry["status"];
  needsBakeryAttention: boolean;
  hasEffectiveRm10: boolean;
  readyAt: string | null;
  pickedUpAt: string | null;
};

export type MatrixCell = {
  totalQuantity: number;
  customers: MatrixCustomerEntry[];
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

/**
 * Build Matrix rows from CalendarEntry month data.
 * Only includes pickup dates in `dateYmids` (selected month).
 * Aggregates same order + cake + size + date into one customer cell quantity.
 */
export function buildCalendarMatrix(
  entries: CalendarEntry[],
  dateYmids: string[],
): MatrixRow[] {
  const dateSet = new Set(dateYmids);
  const rows = new Map<string, MatrixRow>();

  for (const entry of entries) {
    if (!dateSet.has(entry.pickupDate)) continue;

    for (const item of entry.items) {
      const cakeName = item.cakeName.trim() || "Cake";
      const sizeLabel = item.sizeLabel.trim() || "Size";
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

      let cell = row.cellsByDate[entry.pickupDate];
      if (!cell) {
        cell = { totalQuantity: 0, customers: [] };
        row.cellsByDate[entry.pickupDate] = cell;
      }

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
          status: entry.status,
          needsBakeryAttention: entry.needsBakeryAttention,
          hasEffectiveRm10: entry.hasEffectiveRm10,
          readyAt: entry.readyAt,
          pickedUpAt: entry.pickedUpAt,
        });
      }
    }
  }

  const result = Array.from(rows.values()).sort(compareRows);
  for (const row of result) {
    for (const cell of Object.values(row.cellsByDate)) {
      cell.customers.sort(compareCustomers);
    }
  }
  return result;
}
