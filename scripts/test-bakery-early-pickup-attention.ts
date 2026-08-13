/**
 * Early-pickup Attention + Bakery presentation helpers (no DB).
 * Run: npx tsx scripts/test-bakery-early-pickup-attention.ts
 */
import assert from "node:assert/strict";
import { isEarlyPickupAttention } from "@/engines/business-calendar/early-pickup";
import {
  BAKERY_EARLY_PICKUP_DETAIL,
  BAKERY_WAITING_CONFIRMATION_REASON,
  BAKERY_WAITING_CONFIRMATION_START_LABEL,
  bakeryAttentionBadgeLabel,
  bakeryProductionPresentation,
  bakeryStartSurface,
  deriveBakeryPackingReminders,
  hasEffectiveBakeryAttention,
  hasPaymentAttention,
} from "@/workspaces/bakery/eligibility";

function ymdForWeekday(weekday: number): string {
  // 2026-08-09 is Sunday. Offset to the requested weekday.
  const day = 9 + weekday;
  return `2026-08-${String(day).padStart(2, "0")}`;
}

const MON = ymdForWeekday(1);
const TUE = ymdForWeekday(2);
const WED = ymdForWeekday(3);
const THU = ymdForWeekday(4);
const FRI = ymdForWeekday(5);
const SAT = ymdForWeekday(6);
const SUN = ymdForWeekday(0);

assert.equal(new Date(2026, 7, 10).getDay(), 1, "MON fixture weekday");
assert.equal(new Date(2026, 7, 12).getDay(), 3, "WED fixture weekday");
assert.equal(new Date(2026, 7, 9).getDay(), 0, "SUN fixture weekday");

const cases: Array<[string, string, boolean, string]> = [
  [MON, "12:00", true, "Mon 12:00"],
  [MON, "14:30", true, "Mon 2:30"],
  [MON, "15:00", false, "Mon 3:00"],
  [TUE, "14:30", true, "Tue 2:30"],
  [TUE, "15:00", false, "Tue 3:00"],
  [WED, "12:00", true, "Wed 12:00"],
  [WED, "12:30", true, "Wed 12:30"],
  [WED, "13:00", false, "Wed 1:00"],
  [THU, "14:30", true, "Thu 2:30"],
  [THU, "15:00", false, "Thu 3:00"],
  [FRI, "14:30", true, "Fri 2:30"],
  [FRI, "15:00", false, "Fri 3:00"],
  [FRI, "17:30", false, "Fri 5:30"],
  [FRI, "21:30", false, "Fri 9:30"],
  [SAT, "14:30", true, "Sat 2:30"],
  [SAT, "15:00", false, "Sat 3:00"],
  [SAT, "21:30", false, "Sat 9:30"],
  [SUN, "14:30", true, "Sun 2:30"],
  [SUN, "15:00", false, "Sun 3:00"],
  [SUN, "21:30", false, "Sun 9:30"],
];

for (const [date, time, expected, label] of cases) {
  assert.equal(
    isEarlyPickupAttention(date, time),
    expected,
    label,
  );
  assert.equal(
    isEarlyPickupAttention(date, `${time}:00`),
    expected,
    `${label} with :00 seconds`,
  );
}

assert.equal(
  hasEffectiveBakeryAttention({
    needsBakeryAttention: false,
    pickupDate: MON,
    pickupTime: "12:30",
  }),
  true,
  "early + manual false => effective attention",
);

assert.equal(
  hasEffectiveBakeryAttention({
    needsBakeryAttention: false,
    pickupDate: MON,
    pickupTime: "15:00",
  }),
  false,
  "normal + manual false => no attention",
);

assert.equal(
  hasEffectiveBakeryAttention({
    needsBakeryAttention: true,
    pickupDate: MON,
    pickupTime: "12:30",
  }),
  true,
  "early + manual true => effective attention",
);

assert.equal(
  bakeryAttentionBadgeLabel({
    needsBakeryAttention: false,
    pickupDate: MON,
    pickupTime: "12:30",
  }),
  "Bakery Attention · Early pickup",
  "board exposes Early pickup",
);

assert.equal(
  bakeryAttentionBadgeLabel({
    needsBakeryAttention: true,
    pickupDate: MON,
    pickupTime: "12:30",
  }),
  "Bakery Attention · Early pickup",
  "early + manual still shows Early pickup on badge",
);

assert.equal(
  bakeryAttentionBadgeLabel({
    needsBakeryAttention: true,
    pickupDate: MON,
    pickupTime: "15:00",
  }),
  "Bakery Attention",
  "early->normal leaves manual badge",
);

assert.equal(
  bakeryAttentionBadgeLabel({
    needsBakeryAttention: false,
    pickupDate: MON,
    pickupTime: "15:00",
  }),
  null,
  "early->normal clears automatic badge",
);

const manualNote = "Less sweet — stage topper last";
assert.equal(manualNote, "Less sweet — stage topper last");
assert.ok(BAKERY_EARLY_PICKUP_DETAIL.includes("usual Bakery pickup window"));
assert.ok(
  !BAKERY_EARLY_PICKUP_DETAIL.includes(manualNote),
  "early copy does not replace manual note",
);

assert.equal(
  bakeryStartSurface({
    presentation: "not_started",
    status: "submitted",
    canStartProduction: true,
    canUndoStart: true,
  }).kind,
  "waiting_confirmation",
);
assert.equal(
  bakeryStartSurface({
    presentation: "not_started",
    status: "pending_confirmation",
    canStartProduction: true,
    canUndoStart: true,
  }).kind,
  "waiting_confirmation",
);
assert.equal(
  BAKERY_WAITING_CONFIRMATION_START_LABEL,
  "Waiting for confirmation",
);
assert.equal(
  bakeryStartSurface({
    presentation: "not_started",
    status: "submitted",
    canStartProduction: true,
    canUndoStart: true,
  }).kind === "waiting_confirmation"
    ? bakeryStartSurface({
        presentation: "not_started",
        status: "submitted",
        canStartProduction: true,
        canUndoStart: true,
      }).reason
    : null,
  BAKERY_WAITING_CONFIRMATION_REASON,
);

assert.equal(
  bakeryStartSurface({
    presentation: "not_started",
    status: "awaiting_payment",
    canStartProduction: true,
    canUndoStart: true,
  }).kind,
  "start_unsecured",
);
assert.equal(
  bakeryStartSurface({
    presentation: "not_started",
    status: "paid",
    canStartProduction: true,
    canUndoStart: true,
  }).kind,
  "start_paid",
);

assert.equal(
  bakeryProductionPresentation({
    productionStartedAt: "t",
    readyAt: null,
  }),
  "in_production",
);
assert.equal(
  bakeryProductionPresentation({
    productionStartedAt: "t",
    readyAt: "r",
  }),
  "ready",
);

assert.equal(
  hasPaymentAttention({
    productionStartedAt: "t",
    readyAt: null,
    status: "awaiting_payment",
  }),
  true,
);
assert.equal(
  hasPaymentAttention({
    productionStartedAt: "t",
    readyAt: null,
    status: "paid",
  }),
  false,
);

const packing = deriveBakeryPackingReminders({
  complimentaryItems: [{ id: "c1", name: "Knife", quantity: 1 }],
  paidAddons: [],
  includeReceipt: true,
});
assert.ok(packing.some((p) => p.label === "Knife"));
assert.ok(packing.some((p) => p.label === "Include RECEIPT"));

console.log("PASS bakery early-pickup attention / Start waiting UX helpers");
