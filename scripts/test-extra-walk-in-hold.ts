/**
 * Fresh Pick Walk-in Hold — engine predicates and capabilities (no DB).
 * Run: npx tsx scripts/test-extra-walk-in-hold.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  isExtraAvailable,
  isExtraConfirmedOnOffer,
} from "@/engines/extra/availability";
import {
  buildExtraWorkspaceCapabilities,
  canSeeHomeFreshPicks,
  extraFreshPickOperationalStatus,
  extraFreshPickOperationalStatusLabel,
  extraOperationalActionFlags,
} from "@/engines/extra/capabilities";
import {
  extraSubmitCustomerError,
  FRESH_PICKS_SOLD_OUT_MESSAGE,
  isCustomerOrderableFreshPick,
  isPublishedFreshPick,
} from "@/engines/extra/customer-fresh-picks";
import {
  EXTRA_WALK_IN_HOLD_EXTENSION_MINUTES,
  EXTRA_WALK_IN_HOLD_MINUTES,
  EXTRA_WALK_IN_HOLD_REMINDER_LEAD_MINUTES,
  freshPickHomeSummaryLine,
  isExtraWalkInHeld,
  walkInHoldPlaceConfirmDescription,
} from "@/engines/extra/walk-in-hold";

const through = "2026-09-17T15:00:00.000Z";
const now = new Date("2026-09-17T14:00:00.000Z");

assert.equal(EXTRA_WALK_IN_HOLD_MINUTES, 15);
assert.equal(EXTRA_WALK_IN_HOLD_EXTENSION_MINUTES, 15);
assert.equal(EXTRA_WALK_IN_HOLD_REMINDER_LEAD_MINUTES, 3);
assert.match(
  walkInHoldPlaceConfirmDescription(),
  /15-minute walk-in hold/,
);

assert.equal(
  isExtraWalkInHeld({
    walkInHeldUntil: "2026-09-17T14:00:00.000Z",
    now,
  }),
  true,
  "held_until === now is still held",
);

assert.equal(
  isExtraWalkInHeld({
    walkInHeldUntil: "2026-09-17T13:59:59.999Z",
    now,
  }),
  false,
  "held_until < now is expired",
);

assert.equal(
  isExtraAvailable({
    lifecycle: "confirmed",
    pickupThroughAt: through,
    walkInHeldUntil: "2026-09-17T14:15:00.000Z",
    now,
  }),
  false,
);

assert.equal(
  isExtraConfirmedOnOffer({
    lifecycle: "confirmed",
    pickupThroughAt: through,
    now,
  }),
  true,
);

assert.equal(
  isPublishedFreshPick({
    lifecycle: "confirmed",
    pickupThroughAt: through,
    walkInHeldUntil: "2026-09-17T14:15:00.000Z",
    now,
  }),
  true,
  "website catalogue keeps an active hold visible",
);
assert.equal(
  isCustomerOrderableFreshPick({
    lifecycle: "confirmed",
    pickupThroughAt: through,
    walkInHeldUntil: "2026-09-17T14:15:00.000Z",
    now,
  }),
  false,
  "website catalogue does not let customers order an active hold",
);

assert.equal(
  isPublishedFreshPick({
    lifecycle: "confirmed",
    pickupThroughAt: through,
    walkInHeldUntil: "2026-09-17T13:59:59.000Z",
    now,
  }),
  true,
  "website catalogue shows an expired hold without cleanup",
);
assert.equal(
  isCustomerOrderableFreshPick({
    lifecycle: "confirmed",
    pickupThroughAt: through,
    walkInHeldUntil: "2026-09-17T13:59:59.000Z",
    now,
  }),
  true,
  "expired hold is customer-orderable again",
);

assert.equal(
  extraSubmitCustomerError("This Fresh Pick is currently on walk-in hold."),
  FRESH_PICKS_SOLD_OUT_MESSAGE,
);

const owner = buildExtraWorkspaceCapabilities({ role: "owner", staffId: "o" });
const manager = buildExtraWorkspaceCapabilities({
  role: "manager",
  staffId: "m",
});
const co = buildExtraWorkspaceCapabilities({
  role: "customer_operations",
  staffId: "co",
});
const bakery = buildExtraWorkspaceCapabilities({
  role: "bakery",
  staffId: "b",
});
const collection = buildExtraWorkspaceCapabilities({
  role: "collection",
  staffId: "c",
});

assert.equal(owner.canCreateWalkInHold, true);
assert.equal(manager.canCreateWalkInHold, true);
assert.equal(co.canCreateWalkInHold, true);
assert.equal(bakery.canViewWalkInHold, true);
assert.equal(bakery.canCreateWalkInHold, false);
assert.equal(bakery.canExtendWalkInHold, false);
assert.equal(bakery.canReleaseWalkInHold, false);
assert.equal(collection.canViewWalkInHold, false);
assert.equal(collection.canCreateWalkInHold, false);

assert.equal(canSeeHomeFreshPicks(owner), true);
assert.equal(canSeeHomeFreshPicks(manager), true);
assert.equal(canSeeHomeFreshPicks(co), true);
assert.equal(canSeeHomeFreshPicks(bakery), true);
assert.equal(canSeeHomeFreshPicks(collection), false);

const bakeryOpen = extraOperationalActionFlags({
  capabilities: bakery,
  walkInHeld: false,
});
assert.equal(bakeryOpen.assign, true);
assert.equal(bakeryOpen.move, true);
assert.equal(bakeryOpen.cut, true);
assert.equal(bakeryOpen.unconfirm, true);

const bakeryHeld = extraOperationalActionFlags({
  capabilities: bakery,
  walkInHeld: true,
});
assert.equal(bakeryHeld.assign, false);
assert.equal(bakeryHeld.move, false);
assert.equal(bakeryHeld.cut, false);
assert.equal(bakeryHeld.unconfirm, false);

const coOpen = extraOperationalActionFlags({
  capabilities: co,
  walkInHeld: false,
});
assert.equal(coOpen.assign, false);
assert.equal(coOpen.move, false);
assert.equal(coOpen.cut, false);
assert.equal(coOpen.unconfirm, false);

const ownerHeld = extraOperationalActionFlags({
  capabilities: owner,
  walkInHeld: true,
});
assert.equal(ownerHeld.assign, false, "held Extra hides bakery mutations");

assert.equal(
  extraFreshPickOperationalStatusLabel(
    extraFreshPickOperationalStatus({
      soldAt: null,
      cutIntoSlicesAt: null,
      walkInHeld: true,
      available: false,
    }),
  ),
  "On walk-in hold",
);
assert.equal(
  extraFreshPickOperationalStatusLabel(
    extraFreshPickOperationalStatus({
      soldAt: "2026-09-17T13:00:00.000Z",
      cutIntoSlicesAt: null,
      walkInHeld: false,
      available: false,
    }),
  ),
  "Sold",
);
assert.equal(
  extraFreshPickOperationalStatusLabel(
    extraFreshPickOperationalStatus({
      soldAt: null,
      cutIntoSlicesAt: "2026-09-17T13:00:00.000Z",
      walkInHeld: false,
      available: false,
    }),
  ),
  "Cut into slices",
);

assert.equal(
  freshPickHomeSummaryLine({
    preparedOn: "2026-09-17",
    pickupThroughAt: "2026-09-17T09:30:00.000Z",
    todayYmd: "2026-09-17",
  }),
  "Pickup today · 5:30 PM cutoff",
);

const boardSrc = readFileSync(
  resolve("src/workspaces/extra/ExtraBoard.tsx"),
  "utf8",
);
assert.match(boardSrc, /WalkInHoldPanel/);
assert.match(boardSrc, /AssignExtraToOrderDialog/);
assert.match(boardSrc, /MoveExtraWindowDialog/);
assert.match(boardSrc, /CutExtraIntoSlicesDialog/);
assert.match(boardSrc, /Assign to order/);
assert.doesNotMatch(boardSrc, /holdingUnit/);

const actionsSrc = readFileSync(
  resolve("src/workspaces/extra/actions.ts"),
  "utf8",
);
assert.match(actionsSrc, /revalidatePath\("\/home"\)/);
assert.match(actionsSrc, /requireWalkInHoldStaff/);
assert.match(actionsSrc, /requireExtraStaff/);

const migration = readFileSync(
  resolve("supabase/migrations/20260917140000_extra_walk_in_hold.sql"),
  "utf8",
);
assert.match(migration, /hold_extra_stock_walk_in/);
assert.match(migration, /extend_extra_stock_walk_in_hold/);
assert.match(migration, /release_extra_stock_walk_in_hold/);
assert.match(migration, /fresh_pick_walk_in_hold_reminder/);
assert.match(migration, /make_interval\(mins => public\.extra_walk_in_hold_minutes\(\)\)/);
assert.doesNotMatch(migration, /interval '15 minutes'/);
assert.match(migration, /walk_in_held_until < now\(\)/);
assert.match(
  migration,
  /This Fresh Pick is currently on walk-in hold\./,
);

console.log("EXTRA walk-in hold engine: PASS");
