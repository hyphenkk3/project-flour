/**
 * Approval Change Summary — derived from stored payload, never reason.
 * Run: npx tsx scripts/test-approval-change-summary.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildApprovalChangeSummary } from "@/engines/operations/approval-change-summary";
import {
  parseOperationsApprovalPayload,
  type LateOrderEditPaidAddon,
  type LateOrderEditPayload,
  type LateOrderEditProposedItem,
} from "@/engines/operations/approvals";

const cake6: LateOrderEditProposedItem = {
  cakeId: "cake-damour",
  cakeSizeId: "size-6",
  quantity: 1,
  unitPrice: 125,
  cakeName: "Chocolate D'Amour",
  sizeLabel: '6"',
};

const cake8: LateOrderEditProposedItem = {
  ...cake6,
  cakeSizeId: "size-8",
  unitPrice: 165,
  sizeLabel: '8"',
};

const birthday1: LateOrderEditPaidAddon = {
  code: "birthday_card",
  name: "Birthday Card",
  quantity: 1,
  messages: [null],
};

const birthday2: LateOrderEditPaidAddon = {
  ...birthday1,
  quantity: 2,
  messages: [null, null],
};

function lateEdit(input: {
  currentItems?: LateOrderEditProposedItem[];
  proposedItems?: LateOrderEditProposedItem[];
  currentAddons?: LateOrderEditPaidAddon[];
  proposedAddons?: LateOrderEditPaidAddon[];
  currentPickupDate?: string;
  currentPickupTime?: string;
  proposedPickupDate?: string;
  proposedPickupTime?: string;
}): LateOrderEditPayload {
  return {
    kind: "late_order_edit",
    current: {
      pickupDate: input.currentPickupDate ?? "2026-08-15",
      pickupTime: input.currentPickupTime ?? "13:00",
      items: input.currentItems ?? [cake6],
      paidAddons: input.currentAddons ?? [],
    },
    proposed: {
      pickupDate: input.proposedPickupDate ?? "2026-08-15",
      pickupTime: input.proposedPickupTime ?? "13:00",
      items: input.proposedItems ?? [cake6],
      paidAddons: input.proposedAddons ?? [],
    },
  };
}

// A. Cake size 6" → 8"
{
  const summary = buildApprovalChangeSummary(
    lateEdit({ proposedItems: [cake8] }),
  );
  assert.deepEqual(summary.lines, ["Chocolate D'Amour 6\" → 8\""]);
}

// B. Quantity ×1 → ×2
{
  const summary = buildApprovalChangeSummary(
    lateEdit({
      proposedItems: [{ ...cake6, quantity: 2 }],
    }),
  );
  assert.deepEqual(summary.lines, ["Chocolate D'Amour 6\" ×1 → ×2"]);
}

// C. Add-on added
{
  const summary = buildApprovalChangeSummary(
    lateEdit({ proposedAddons: [birthday1] }),
  );
  assert.deepEqual(summary.lines, ["Add Birthday Card ×1"]);
}

// D. Add-on removed
{
  const summary = buildApprovalChangeSummary(
    lateEdit({ currentAddons: [birthday1], proposedAddons: [] }),
  );
  assert.deepEqual(summary.lines, ["Remove Birthday Card ×1"]);
}

// E. Add-on quantity ×1 → ×2
{
  const summary = buildApprovalChangeSummary(
    lateEdit({
      currentAddons: [birthday1],
      proposedAddons: [birthday2],
    }),
  );
  assert.deepEqual(summary.lines, ["Birthday Card ×1 → ×2"]);
}

// F. Pickup time 1:00 PM → 3:00 PM
{
  const summary = buildApprovalChangeSummary(
    lateEdit({ proposedPickupTime: "15:00" }),
  );
  assert.deepEqual(summary.lines, ["Pickup 15/08/2026 · 1:00 PM → 3:00 PM"]);
}

// G. Same-month pickup date change
{
  const summary = buildApprovalChangeSummary(
    lateEdit({ proposedPickupDate: "2026-08-16" }),
  );
  assert.deepEqual(summary.lines, [
    "Pickup 15/08/2026 · 1:00 PM → 16/08/2026 · 1:00 PM",
  ]);
}

// H. Multiple simultaneous changes
{
  const summary = buildApprovalChangeSummary(
    lateEdit({
      proposedItems: [cake8],
      proposedAddons: [birthday1],
      proposedPickupTime: "15:00",
    }),
  );
  assert.deepEqual(summary.lines, [
    "Chocolate D'Amour 6\" → 8\"",
    "Add Birthday Card ×1",
    "Pickup 15/08/2026 · 1:00 PM → 3:00 PM",
  ]);
}

// I. Add-on-only: cake and pickup unchanged (Product bug case)
{
  const payload = lateEdit({ proposedAddons: [birthday1] });
  const summary = buildApprovalChangeSummary(payload);
  assert.deepEqual(summary.lines, ["Add Birthday Card ×1"]);
  assert.deepEqual(summary.currentLines, [
    "Chocolate D'Amour · 6\"",
    "Pickup 15/08/2026 · 1:00 PM",
  ]);
  assert.deepEqual(summary.requestedLines, [
    "Chocolate D'Amour · 6\"",
    "Birthday Card ×1",
    "Pickup 15/08/2026 · 1:00 PM",
  ]);
}

// J. Identical current/proposed: no false change
{
  const summary = buildApprovalChangeSummary(lateEdit({}));
  assert.deepEqual(summary.lines, []);
  assert.equal(summary.currentLines.join("\n"), summary.requestedLines.join("\n"));
}

// K. Reason independence — summary ignores free-text reason
{
  const stored = {
    kind: "late_order_edit",
    current: {
      pickup_date: "2026-08-15",
      pickup_time: "13:00",
      items: [
        {
          cake_id: cake6.cakeId,
          cake_size_id: cake6.cakeSizeId,
          quantity: 1,
          unit_price: 125,
          cake_name: cake6.cakeName,
          size_label: cake6.sizeLabel,
        },
      ],
      paid_addons: [],
    },
    proposed: {
      pickup_date: "2026-08-15",
      pickup_time: "13:00",
      items: [
        {
          cake_id: cake6.cakeId,
          cake_size_id: cake6.cakeSizeId,
          quantity: 1,
          unit_price: 125,
          cake_name: cake6.cakeName,
          size_label: cake6.sizeLabel,
        },
      ],
      paid_addons: [
        {
          code: "birthday_card",
          name: "Birthday Card",
          quantity: 1,
          messages: [null],
        },
      ],
    },
  };
  const parsed = parseOperationsApprovalPayload("late_order_edit", stored);
  assert.equal(parsed?.kind, "late_order_edit");
  if (parsed?.kind !== "late_order_edit") throw new Error("expected late_order_edit");
  assert.equal(parsed.proposed.paidAddons?.[0]?.code, "birthday_card");
  assert.equal(parsed.proposed.paidAddons?.[0]?.quantity, 1);
  const fromPayload = buildApprovalChangeSummary(parsed);
  assert.deepEqual(fromPayload.lines, ["Add Birthday Card ×1"]);
  assert.equal(fromPayload.lines.join(" ").toLowerCase().includes("birthday"), true);
  const reasonA = "add on birthday card";
  const reasonB = "please help";
  assert.notEqual(reasonA, reasonB);
  assert.deepEqual(
    buildApprovalChangeSummary(parsed).lines,
    buildApprovalChangeSummary(parsed).lines,
    "reason is not an input to the summary",
  );
  assert.equal(
    JSON.stringify(fromPayload).includes(reasonA),
    false,
    "summary must not copy the reason field",
  );
}

// Discount exception
{
  const summary = buildApprovalChangeSummary({
    kind: "discount_exception",
    action: "redeem_rm10",
    voucherNumber: "677",
    expiryDate: "2026-08-10",
    eligibilityReason: "Voucher expired before pickup; approval requested.",
    currentAmountDue: 125,
    requestedAmountDue: 115,
  });
  assert.deepEqual(summary.lines, ["Apply RM10 discount voucher #677"]);
  assert.ok(summary.currentLines.some((line) => line.includes("677")));
  assert.ok(summary.currentLines.some((line) => line.includes("10/08/2026")));
  assert.ok(
    summary.currentLines.some((line) => line.includes("Voucher expired before pickup")),
  );
  assert.deepEqual(summary.requestedLines, ["Amount due RM115"]);
}

// Cross-month pickup
{
  const summary = buildApprovalChangeSummary({
    kind: "cross_month_pickup",
    currentPickupDate: "2026-08-15",
    currentPickupTime: "13:00",
    proposedPickupDate: "2026-09-10",
    proposedPickupTime: "11:00",
    fulfilmentMethod: "pickup",
  });
  assert.equal(summary.lines[0], "Cross-month pickup");
  assert.deepEqual(summary.lines, [
    "Cross-month pickup",
    "15/08/2026 · 1:00 PM → 10/09/2026 · 11:00 AM",
  ]);
  assert.deepEqual(summary.currentLines, ["15/08/2026 · 1:00 PM"]);
  assert.deepEqual(summary.requestedLines, ["10/09/2026 · 11:00 AM"]);
}

const panelSrc = readFileSync(
  resolve("src/workspaces/owner/approvals/OrderApprovalPanel.tsx"),
  "utf8",
);
assert.match(panelSrc, /buildApprovalChangeSummary/);
assert.match(panelSrc, /Change requested/);
assert.doesNotMatch(
  panelSrc,
  /payload\.proposed\.items[\s\S]*item\.cakeName/,
  "review panel must not render cake-only snapshots without the derived summary",
);

const formSrc = readFileSync(
  resolve("src/workspaces/owner/orders/OrderWorkspaceForm.tsx"),
  "utf8",
);
assert.match(formSrc, /paidAddons: describeProposedPaidAddons/);
assert.match(formSrc, /paidAddons: describeCurrentPaidAddons/);

const migration = readFileSync(
  resolve("supabase/migrations/20260814170000_late_order_edit_paid_addons.sql"),
  "utf8",
);
assert.match(migration, /sync_guest_order_paid_addons/);
assert.match(migration, /paid_addons_signature/);
assert.match(migration, /proposed,paid_addons/);
assert.doesNotMatch(migration, /whatChanged|changeDescription|manualChangeSummary/);

console.log("PASS  approval change summary + payload-derived add-on mutation");
