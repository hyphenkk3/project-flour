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

export type ApprovalChangeLinePart =
  | { kind: "text"; text: string }
  | { kind: "muted"; text: string }
  | { kind: "struck"; text: string }
  | { kind: "emphasis"; text: string };

export type ApprovalChangeLine = {
  /** Plain-text form for tests, search, and accessibility. */
  plain: string;
  parts: ApprovalChangeLinePart[];
};

export type ApprovalChangeSummary = {
  /** Plain-text change lines (same content as changeLines[].plain). */
  lines: string[];
  /** Structured change lines for restrained visual emphasis. */
  changeLines: ApprovalChangeLine[];
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
  const changeLines = [
    plainLine(actionLine),
  ];
  return {
    lines: changeLines.map((line) => line.plain),
    changeLines,
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
  const changeLines = [
    plainLine("Cross-month pickup"),
    changeLine(`${currentPickup} → ${requestedPickup}`, [
      { kind: "struck", text: currentPickup },
      { kind: "text", text: " → " },
      { kind: "emphasis", text: requestedPickup },
    ]),
  ];
  return {
    lines: changeLines.map((line) => line.plain),
    changeLines,
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

  const changeLines = [
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
    lines: changeLines.map((line) => line.plain),
    changeLines,
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
): ApprovalChangeLine[] {
  const lines: ApprovalChangeLine[] = [];
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
        quantityChangeLine({
          label: `${currentItem.cakeName} ${currentItem.sizeLabel}`,
          fromQty: currentItem.quantity,
          toQty: proposedItem.quantity,
        }),
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
        const plain = `${currentItem.cakeName} ${currentItem.sizeLabel} ×${currentItem.quantity} → ${proposedItem.sizeLabel} ×${proposedItem.quantity}`;
        lines.push(
          changeLine(plain, [
            { kind: "text", text: `${currentItem.cakeName} ` },
            {
              kind: "struck",
              text: `${currentItem.sizeLabel} ×${currentItem.quantity}`,
            },
            { kind: "text", text: " → " },
            {
              kind: "emphasis",
              text: `${proposedItem.sizeLabel} ×${proposedItem.quantity}`,
            },
          ]),
        );
      } else if (sizeChanged) {
        const plain = `${currentItem.cakeName} ${currentItem.sizeLabel} → ${proposedItem.sizeLabel}`;
        lines.push(
          changeLine(plain, [
            { kind: "text", text: `${currentItem.cakeName} ` },
            { kind: "struck", text: currentItem.sizeLabel },
            { kind: "text", text: " → " },
            { kind: "emphasis", text: proposedItem.sizeLabel },
          ]),
        );
      } else if (qtyChanged) {
        lines.push(
          quantityChangeLine({
            label: `${currentItem.cakeName} ${currentItem.sizeLabel}`,
            fromQty: currentItem.quantity,
            toQty: proposedItem.quantity,
          }),
        );
      }
    } else {
      const plain = `Add ${proposedItem.cakeName} ${proposedItem.sizeLabel} ×${proposedItem.quantity}`;
      lines.push(
        changeLine(plain, [
          { kind: "emphasis", text: "Add" },
          {
            kind: "text",
            text: ` ${proposedItem.cakeName} ${proposedItem.sizeLabel} ×${proposedItem.quantity}`,
          },
        ]),
      );
    }
  }

  for (const currentItem of unmatchedCurrent) {
    if (usedCurrent.has(cakeIdentity(currentItem))) continue;
    const plain = `Remove ${currentItem.cakeName} ${currentItem.sizeLabel} ×${currentItem.quantity}`;
    lines.push(
      changeLine(plain, [
        { kind: "text", text: "Remove " },
        {
          kind: "struck",
          text: `${currentItem.cakeName} ${currentItem.sizeLabel} ×${currentItem.quantity}`,
        },
      ]),
    );
  }

  return lines;
}

function diffPaidAddons(
  current: LateOrderEditPaidAddon[],
  proposed: LateOrderEditPaidAddon[],
): ApprovalChangeLine[] {
  const lines: ApprovalChangeLine[] = [];
  const currentByCode = new Map(current.map((addon) => [addon.code, addon]));
  const proposedByCode = new Map(proposed.map((addon) => [addon.code, addon]));
  const codes = new Set([...currentByCode.keys(), ...proposedByCode.keys()]);

  for (const code of [...codes].sort()) {
    const before = currentByCode.get(code);
    const after = proposedByCode.get(code);
    if (!before && after) {
      const plain = `Add ${after.name} ×${after.quantity}`;
      lines.push(
        changeLine(plain, [
          { kind: "emphasis", text: "Add" },
          { kind: "text", text: ` ${after.name} ×${after.quantity}` },
        ]),
      );
      continue;
    }
    if (before && !after) {
      const plain = `Remove ${before.name} ×${before.quantity}`;
      lines.push(
        changeLine(plain, [
          { kind: "text", text: "Remove " },
          { kind: "struck", text: `${before.name} ×${before.quantity}` },
        ]),
      );
      continue;
    }
    if (!before || !after) continue;
    if (before.quantity !== after.quantity) {
      lines.push(
        quantityChangeLine({
          label: before.name,
          fromQty: before.quantity,
          toQty: after.quantity,
        }),
      );
      continue;
    }
    if (messagesSignature(before) !== messagesSignature(after)) {
      lines.push(plainLine(`${before.name} message updated`));
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
}): ApprovalChangeLine[] {
  if (!input.proposedPickupSpecified) return [];
  if (!input.proposedDate && !input.proposedTime) return [];
  const currentDate = input.currentDate;
  const proposedDate = input.proposedDate || currentDate;
  const currentTime = normalizePickupTime(input.currentTime);
  const proposedTime = normalizePickupTime(input.proposedTime || input.currentTime);
  if (!proposedDate || !proposedTime) return [];
  if (currentDate === proposedDate && currentTime === proposedTime) return [];
  if (currentDate === proposedDate) {
    const fromClock = formatPickupClock(currentTime);
    const toClock = formatPickupClock(proposedTime);
    const plain = `Pickup ${formatDdMmYyyy(proposedDate)} · ${fromClock} → ${toClock}`;
    return [
      changeLine(plain, [
        {
          kind: "text",
          text: `Pickup ${formatDdMmYyyy(proposedDate)} · `,
        },
        { kind: "struck", text: fromClock },
        { kind: "text", text: " → " },
        { kind: "emphasis", text: toClock },
      ]),
    ];
  }
  const fromPickup = formatPickup(currentDate, currentTime);
  const toPickup = formatPickup(proposedDate, proposedTime);
  const plain = `Pickup ${fromPickup} → ${toPickup}`;
  return [
    changeLine(plain, [
      { kind: "text", text: "Pickup " },
      { kind: "struck", text: fromPickup },
      { kind: "text", text: " → " },
      { kind: "emphasis", text: toPickup },
    ]),
  ];
}

function quantityChangeLine(input: {
  label: string;
  fromQty: number;
  toQty: number;
}): ApprovalChangeLine {
  const plain = `${input.label} ×${input.fromQty} → ×${input.toQty}`;
  if (input.toQty < input.fromQty) {
    return changeLine(plain, [
      { kind: "text", text: `${input.label} ` },
      { kind: "struck", text: `×${input.fromQty}` },
      { kind: "text", text: " → " },
      { kind: "emphasis", text: `×${input.toQty}` },
    ]);
  }
  // Increase: mute old quantity, emphasize new (no strike — value still valid as baseline).
  return changeLine(plain, [
    { kind: "text", text: `${input.label} ` },
    { kind: "muted", text: `×${input.fromQty}` },
    { kind: "text", text: " → " },
    { kind: "emphasis", text: `×${input.toQty}` },
  ]);
}

function plainLine(text: string): ApprovalChangeLine {
  return changeLine(text, [{ kind: "text", text }]);
}

function changeLine(
  plain: string,
  parts: ApprovalChangeLinePart[],
): ApprovalChangeLine {
  return { plain, parts };
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
