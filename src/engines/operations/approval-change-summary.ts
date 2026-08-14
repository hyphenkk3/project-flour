/**
 * System-derived Change Summary for Operations approval review.
 * Source of truth is the stored payload, never the free-text reason.
 */

import { formatDdMmYyyy } from "@/lib/dates";
import type {
  CrossMonthPickupPayload,
  DiscountExceptionPayload,
  LateOrderEditPaidAddon,
  LateOrderEditPayload,
  LateOrderEditProposedItem,
  OperationsApprovalPayload,
} from "@/engines/operations/approvals";

export type ApprovalChangeSummary = {
  lines: string[];
  currentLines: string[];
  requestedLines: string[];
};

export function buildApprovalChangeSummary(
  payload: OperationsApprovalPayload,
): ApprovalChangeSummary {
  if (payload.kind === "discount_exception") {
    return summarizeDiscountException(payload);
  }
  if (payload.kind === "cross_month_pickup") {
    return summarizeCrossMonthPickup(payload);
  }
  return summarizeLateOrderEdit(payload);
}

function summarizeDiscountException(
  payload: DiscountExceptionPayload,
): ApprovalChangeSummary {
  const voucher = `voucher #${payload.voucherNumber}`;
  const actionLine =
    payload.action === "change_august_to_rm10"
      ? `Change August Promo to RM10 discount ${voucher}`
      : `Apply RM10 discount ${voucher}`;
  const currentLines = [
    `Amount due ${formatRmAmount(payload.currentAmountDue)}`,
    `Voucher #${payload.voucherNumber}`,
    `Expiry ${formatDdMmYyyy(payload.expiryDate)}`,
  ];
  if (payload.eligibilityReason) {
    currentLines.push(payload.eligibilityReason);
  }
  return {
    lines: [actionLine],
    currentLines,
    requestedLines: [`Amount due ${formatRmAmount(payload.requestedAmountDue)}`],
  };
}

function summarizeCrossMonthPickup(
  payload: CrossMonthPickupPayload,
): ApprovalChangeSummary {
  const currentPickup = formatPickup(
    payload.currentPickupDate,
    payload.currentPickupTime,
  );
  const requestedPickup = formatPickup(
    payload.proposedPickupDate,
    payload.proposedPickupTime,
  );
  return {
    lines: [`Cross-month pickup`, `${currentPickup} → ${requestedPickup}`],
    currentLines: [currentPickup],
    requestedLines: [requestedPickup],
  };
}

function summarizeLateOrderEdit(
  payload: LateOrderEditPayload,
): ApprovalChangeSummary {
  const currentItems = payload.current?.items ?? [];
  const proposedItems = payload.proposed.items ?? currentItems;
  const currentAddons = payload.current?.paidAddons ?? [];
  const proposedAddons = payload.proposed.paidAddons ?? currentAddons;
  const currentPickupDate = payload.current?.pickupDate ?? "";
  const currentPickupTime = payload.current?.pickupTime ?? "";
  const proposedPickupDate = payload.proposed.pickupDate ?? currentPickupDate;
  const proposedPickupTime = payload.proposed.pickupTime ?? currentPickupTime;

  const lines = [
    ...diffCakeItems(currentItems, proposedItems),
    ...diffPaidAddons(currentAddons, proposedAddons),
    ...diffPickup({
      currentDate: currentPickupDate,
      currentTime: currentPickupTime,
      proposedDate: proposedPickupDate,
      proposedTime: proposedPickupTime,
      proposedPickupSpecified:
        payload.proposed.pickupDate != null || payload.proposed.pickupTime != null,
    }),
  ];

  return {
    lines,
    currentLines: snapshotLines({
      items: currentItems,
      paidAddons: currentAddons,
      pickupDate: currentPickupDate,
      pickupTime: currentPickupTime,
    }),
    requestedLines: snapshotLines({
      items: proposedItems,
      paidAddons: proposedAddons,
      pickupDate: proposedPickupDate,
      pickupTime: proposedPickupTime,
    }),
  };
}

function snapshotLines(input: {
  items: LateOrderEditProposedItem[];
  paidAddons: LateOrderEditPaidAddon[];
  pickupDate: string;
  pickupTime: string;
}): string[] {
  const lines: string[] = [];
  for (const item of input.items) {
    const qty = item.quantity !== 1 ? ` ×${item.quantity}` : "";
    lines.push(`${item.cakeName} · ${item.sizeLabel}${qty}`);
  }
  for (const addon of input.paidAddons) {
    lines.push(`${addon.name} ×${addon.quantity}`);
  }
  if (input.pickupDate && input.pickupTime) {
    lines.push(`Pickup ${formatPickup(input.pickupDate, input.pickupTime)}`);
  } else if (input.pickupDate) {
    lines.push(`Pickup ${formatDdMmYyyy(input.pickupDate)}`);
  }
  return lines;
}

function diffCakeItems(
  current: LateOrderEditProposedItem[],
  proposed: LateOrderEditProposedItem[],
): string[] {
  const lines: string[] = [];
  const currentByIdentity = new Map(
    current.map((item) => [cakeIdentity(item), item]),
  );
  const usedCurrent = new Set<string>();
  const usedProposed = new Set<string>();

  for (const proposedItem of proposed) {
    const key = cakeIdentity(proposedItem);
    const currentItem = currentByIdentity.get(key);
    if (!currentItem) continue;
    usedCurrent.add(key);
    usedProposed.add(key);
    if (currentItem.quantity !== proposedItem.quantity) {
      lines.push(
        `${currentItem.cakeName} ${currentItem.sizeLabel} ×${currentItem.quantity} → ×${proposedItem.quantity}`,
      );
    }
  }

  const unmatchedCurrent = current.filter(
    (item) => !usedCurrent.has(cakeIdentity(item)),
  );
  const unmatchedProposed = proposed.filter(
    (item) => !usedProposed.has(cakeIdentity(item)),
  );
  const currentByCakeId = new Map<string, LateOrderEditProposedItem[]>();
  for (const item of unmatchedCurrent) {
    const group = currentByCakeId.get(item.cakeId) ?? [];
    group.push(item);
    currentByCakeId.set(item.cakeId, group);
  }

  for (const proposedItem of unmatchedProposed) {
    const group = currentByCakeId.get(proposedItem.cakeId) ?? [];
    const currentItem = group.shift();
    if (currentItem) {
      usedCurrent.add(cakeIdentity(currentItem));
      const sizeChanged = currentItem.sizeLabel !== proposedItem.sizeLabel;
      const qtyChanged = currentItem.quantity !== proposedItem.quantity;
      if (sizeChanged && qtyChanged) {
        lines.push(
          `${currentItem.cakeName} ${currentItem.sizeLabel} ×${currentItem.quantity} → ${proposedItem.sizeLabel} ×${proposedItem.quantity}`,
        );
      } else if (sizeChanged) {
        lines.push(
          `${currentItem.cakeName} ${currentItem.sizeLabel} → ${proposedItem.sizeLabel}`,
        );
      } else if (qtyChanged) {
        lines.push(
          `${currentItem.cakeName} ${currentItem.sizeLabel} ×${currentItem.quantity} → ×${proposedItem.quantity}`,
        );
      }
    } else {
      lines.push(
        `Add ${proposedItem.cakeName} ${proposedItem.sizeLabel} ×${proposedItem.quantity}`,
      );
    }
  }

  for (const currentItem of unmatchedCurrent) {
    if (usedCurrent.has(cakeIdentity(currentItem))) continue;
    lines.push(
      `Remove ${currentItem.cakeName} ${currentItem.sizeLabel} ×${currentItem.quantity}`,
    );
  }

  return lines;
}

function diffPaidAddons(
  current: LateOrderEditPaidAddon[],
  proposed: LateOrderEditPaidAddon[],
): string[] {
  const lines: string[] = [];
  const currentByCode = new Map(current.map((addon) => [addon.code, addon]));
  const proposedByCode = new Map(proposed.map((addon) => [addon.code, addon]));
  const codes = new Set([...currentByCode.keys(), ...proposedByCode.keys()]);

  for (const code of [...codes].sort()) {
    const before = currentByCode.get(code);
    const after = proposedByCode.get(code);
    if (!before && after) {
      lines.push(`Add ${after.name} ×${after.quantity}`);
      continue;
    }
    if (before && !after) {
      lines.push(`Remove ${before.name} ×${before.quantity}`);
      continue;
    }
    if (!before || !after) continue;
    if (before.quantity !== after.quantity) {
      lines.push(`${before.name} ×${before.quantity} → ×${after.quantity}`);
      continue;
    }
    if (messagesSignature(before) !== messagesSignature(after)) {
      lines.push(`${before.name} message updated`);
    }
  }

  return lines;
}

function diffPickup(input: {
  currentDate: string;
  currentTime: string;
  proposedDate: string;
  proposedTime: string;
  proposedPickupSpecified: boolean;
}): string[] {
  if (!input.proposedPickupSpecified) return [];
  if (!input.proposedDate && !input.proposedTime) return [];
  const currentDate = input.currentDate;
  const proposedDate = input.proposedDate || currentDate;
  const currentTime = normalizePickupTime(input.currentTime);
  const proposedTime = normalizePickupTime(input.proposedTime || input.currentTime);
  if (!proposedDate || !proposedTime) return [];
  if (currentDate === proposedDate && currentTime === proposedTime) return [];
  if (currentDate === proposedDate) {
    return [
      `Pickup ${formatDdMmYyyy(proposedDate)} · ${formatPickupClock(currentTime)} → ${formatPickupClock(proposedTime)}`,
    ];
  }
  return [
    `Pickup ${formatPickup(currentDate, currentTime)} → ${formatPickup(proposedDate, proposedTime)}`,
  ];
}

function cakeIdentity(item: LateOrderEditProposedItem): string {
  return `${item.cakeId}:${item.cakeSizeId}`;
}

function messagesSignature(addon: LateOrderEditPaidAddon): string {
  return addon.messages.map((message) => (message ?? "").trim()).join("~");
}

function formatPickup(date: string, time: string): string {
  return `${formatDdMmYyyy(date)} · ${formatPickupClock(time)}`;
}

function normalizePickupTime(value: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return value.trim();
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function formatPickupClock(time: string): string {
  const normalized = normalizePickupTime(time);
  const parts = normalized.split(":");
  if (parts.length < 2) return time;
  const hours = Number(parts[0]);
  const minutes = parts[1];
  if (!Number.isFinite(hours)) return time;
  const hour = hours === 24 ? 0 : hours;
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minutes} ${suffix}`;
}

function formatRmAmount(amount: number): string {
  return `RM${amount.toFixed(amount % 1 === 0 ? 0 : 2)}`;
}
