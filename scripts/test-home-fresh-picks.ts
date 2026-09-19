/**
 * Home Fresh Picks operational quick actions — source + capability tests.
 * Run: npx tsx scripts/test-home-fresh-picks.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildExtraWorkspaceCapabilities,
  canSeeHomeFreshPicks,
  extraOperationalActionFlags,
} from "@/engines/extra/capabilities";
import {
  HOME_FRESH_PICKS_PREVIEW_LIMIT,
  compareHomeFreshPickUnits,
  formatHomeFreshPickSizePrice,
  homeFreshPickStatusLabel,
  isFreshPickNew,
  previewHomeFreshPicks,
} from "@/engines/extra/home-fresh-picks";
import {
  walkInHoldCountdownLabel,
  walkInHoldHomeUntilLine,
} from "@/engines/extra/walk-in-hold";

function readSrc(relative: string): string {
  return readFileSync(resolve(relative), "utf8");
}

const owner = buildExtraWorkspaceCapabilities({ role: "owner", staffId: "o" });
const manager = buildExtraWorkspaceCapabilities({
  role: "manager",
  staffId: "m",
});
const bakery = buildExtraWorkspaceCapabilities({
  role: "bakery",
  staffId: "b",
});
const co = buildExtraWorkspaceCapabilities({
  role: "customer_operations",
  staffId: "co",
});
const collection = buildExtraWorkspaceCapabilities({
  role: "collection",
  staffId: "c",
});

assert.equal(canSeeHomeFreshPicks(owner), true);
assert.equal(canSeeHomeFreshPicks(manager), true);
assert.equal(canSeeHomeFreshPicks(bakery), true);
assert.equal(canSeeHomeFreshPicks(co), true);
assert.equal(canSeeHomeFreshPicks(collection), false);

assert.equal(bakery.canAssignExtraToOrder, true);
assert.equal(bakery.canCreateWalkInHold, false);
assert.equal(bakery.canExtendWalkInHold, false);
assert.equal(bakery.canReleaseWalkInHold, false);
assert.equal(bakery.canViewWalkInHold, true);

assert.equal(co.canAssignExtraToOrder, false);
assert.equal(co.canMoveExtraWindow, false);
assert.equal(co.canCutExtraIntoSlices, false);
assert.equal(co.canUnconfirmExtra, false);
assert.equal(co.canCreateWalkInHold, true);
assert.equal(co.canExtendWalkInHold, true);
assert.equal(co.canReleaseWalkInHold, true);

assert.equal(owner.canAssignExtraToOrder, true);
assert.equal(owner.canCreateWalkInHold, true);
assert.equal(manager.canAssignExtraToOrder, true);
assert.equal(manager.canCreateWalkInHold, true);

const coFlags = extraOperationalActionFlags({
  capabilities: co,
  walkInHeld: false,
});
assert.equal(coFlags.assign, false, "CO does not gain Bakery assign on Home");
assert.equal(coFlags.cut, false);
assert.equal(coFlags.move, false);
assert.equal(coFlags.unconfirm, false);

const bakeryHeld = extraOperationalActionFlags({
  capabilities: bakery,
  walkInHeld: true,
});
assert.equal(bakeryHeld.assign, false);
assert.equal(bakeryHeld.cut, false);

const now = new Date("2026-09-19T04:00:00.000Z");
assert.equal(
  isFreshPickNew({
    confirmedAt: "2026-09-19T03:30:00.000Z",
    now,
  }),
  true,
);
assert.equal(
  isFreshPickNew({
    confirmedAt: "2026-09-19T02:59:59.000Z",
    now,
  }),
  false,
);
assert.equal(isFreshPickNew({ confirmedAt: null, now }), false);
assert.equal(
  homeFreshPickStatusLabel({
    walkInHeld: false,
    confirmedAt: "2026-09-19T03:30:00.000Z",
    now,
  }),
  "Available · New",
);
assert.equal(
  homeFreshPickStatusLabel({
    walkInHeld: true,
    confirmedAt: "2026-09-19T03:30:00.000Z",
    now,
  }),
  "Held · New",
);
assert.equal(
  homeFreshPickStatusLabel({
    walkInHeld: false,
    confirmedAt: "2026-09-19T02:00:00.000Z",
    now,
  }),
  "Available",
);

assert.equal(
  formatHomeFreshPickSizePrice({ sizeLabel: '6"', unitPrice: 135 }),
  '6" · RM135',
);

const newerAvailable = {
  walkInHeld: false,
  walkInHeldUntil: null,
  pickupThroughAt: "2026-09-19T13:30:00.000Z",
  confirmedAt: "2026-09-19T03:50:00.000Z",
  proposedAt: "2026-09-19T03:50:00.000Z",
  id: "new-available",
};
const olderAvailable = {
  walkInHeld: false,
  walkInHeldUntil: null,
  pickupThroughAt: "2026-09-19T13:30:00.000Z",
  confirmedAt: "2026-09-19T01:00:00.000Z",
  proposedAt: "2026-09-19T01:00:00.000Z",
  id: "old-available",
};
const heldSooner = {
  walkInHeld: true,
  walkInHeldUntil: "2026-09-19T04:10:00.000Z",
  pickupThroughAt: "2026-09-19T15:00:00.000Z",
  confirmedAt: "2026-09-19T03:55:00.000Z",
  proposedAt: "2026-09-19T03:55:00.000Z",
  id: "held-soon",
};
const heldLater = {
  walkInHeld: true,
  walkInHeldUntil: "2026-09-19T04:20:00.000Z",
  pickupThroughAt: "2026-09-19T12:00:00.000Z",
  confirmedAt: "2026-09-19T00:00:00.000Z",
  proposedAt: "2026-09-19T00:00:00.000Z",
  id: "held-later",
};
const ordered = [newerAvailable, olderAvailable, heldLater, heldSooner].sort(
  compareHomeFreshPickUnits,
);
assert.deepEqual(
  ordered.map((row) => row.id),
  ["held-soon", "held-later", "old-available", "new-available"],
  "held first by expiry; available by oldest creation, not New",
);
assert.equal(HOME_FRESH_PICKS_PREVIEW_LIMIT, 4);
assert.equal(previewHomeFreshPicks(ordered, 4).length, 4);

assert.equal(
  walkInHoldCountdownLabel("2026-09-19T04:08:00.000Z", now),
  "8 min left",
);
assert.equal(
  walkInHoldCountdownLabel("2026-09-19T04:00:30.000Z", now),
  "Expires soon · 1 min left",
);
assert.equal(
  walkInHoldCountdownLabel("2026-09-19T03:59:00.000Z", now),
  "Expires soon · 1 min left",
);
assert.match(
  walkInHoldHomeUntilLine("2026-09-19T04:08:00.000Z", now),
  /Held until .* · 8 min left/,
);
assert.equal(
  walkInHoldHomeUntilLine("2026-09-19T04:00:30.000Z", now),
  "Expires soon · 1 min left",
);

const pageSrc = readSrc("src/app/(app)/home/page.tsx");
assert.match(pageSrc, /listHomeFreshPickUnits/);
assert.match(pageSrc, /canSeeHomeFreshPicks/);
assert.match(pageSrc, /buildExtraWorkspaceCapabilities/);
assert.match(pageSrc, /freshPickLoadError/);
assert.doesNotMatch(pageSrc, /listExtraStockUnits\(/);

const cockpitSrc = readSrc("src/workspaces/home/HomeCockpit.tsx");
assert.match(cockpitSrc, /HomeFreshPicksOperations/);
assert.doesNotMatch(cockpitSrc, /from "@\/workspaces\/extra\/ExtraBoard"/);

const homeOpsSrc = readSrc("src/workspaces/home/HomeFreshPicksOperations.tsx");
assert.match(homeOpsSrc, /AssignExtraToOrderDialog/);
assert.match(homeOpsSrc, /MoveExtraWindowDialog/);
assert.match(homeOpsSrc, /CutExtraIntoSlicesDialog/);
assert.match(homeOpsSrc, /WalkInHoldPanel/);
assert.match(homeOpsSrc, /unconfirmExtraStockAction/);
assert.match(homeOpsSrc, /listHomeFreshPickUnitsAction/);
assert.match(homeOpsSrc, /extraOperationalActionFlags/);
assert.match(homeOpsSrc, /Assign to order/);
assert.match(homeOpsSrc, /Move pickup window/);
assert.match(homeOpsSrc, /Cut into slices/);
assert.match(homeOpsSrc, /Undo availability/);
assert.match(homeOpsSrc, /More ▾/);
assert.match(homeOpsSrc, /View all →/);
assert.match(homeOpsSrc, /Fresh Picks · \{units\.length\}/);
assert.match(homeOpsSrc, /Nothing fresh at the moment/);
assert.match(homeOpsSrc, /Loading Fresh Picks/);
assert.match(homeOpsSrc, /We couldn/);
assert.match(homeOpsSrc, /load Fresh Picks right now/);
assert.match(homeOpsSrc, /customer-operations\/fresh-picks/);
assert.match(homeOpsSrc, /\/bakery\/extra/);
assert.match(homeOpsSrc, /CakePhotoImage/);
assert.match(homeOpsSrc, /lg:grid-cols-4/);
assert.doesNotMatch(homeOpsSrc, /View Extra/);
assert.doesNotMatch(homeOpsSrc, /from "@\/workspaces\/extra\/ExtraBoard"/);
assert.doesNotMatch(homeOpsSrc, /Propose EXTRA/);
assert.doesNotMatch(homeOpsSrc, /Confirm Available/);

const querySrc = readSrc("src/workspaces/extra/queries.ts");
assert.match(querySrc, /export async function listHomeFreshPickUnits/);
assert.match(querySrc, /isExtraConfirmedOnOffer/);
assert.match(querySrc, /compareHomeFreshPickUnits/);
assert.match(querySrc, /resolveCakePhoto/);
assert.match(querySrc, /library_cake_photos/);
assert.match(querySrc, /library_cake_sizes/);
assert.match(querySrc, /\.eq\("lifecycle", "confirmed"\)/);
assert.match(querySrc, /\.is\("sold_at", null\)/);
assert.match(querySrc, /\.is\("cut_into_slices_at", null\)/);

const actionsSrc = readSrc("src/workspaces/extra/actions.ts");
assert.match(actionsSrc, /revalidatePath\("\/home"\)/);
assert.match(actionsSrc, /requireExtraStaff/);
assert.match(actionsSrc, /requireWalkInHoldStaff/);
assert.match(actionsSrc, /listHomeFreshPickUnitsAction/);
assert.match(actionsSrc, /if \(!caps\.canAssignExtraToOrder\)/);
assert.match(actionsSrc, /if \(!caps\.canCreateWalkInHold\)/);

const boardSrc = readSrc("src/workspaces/extra/ExtraBoard.tsx");
assert.match(boardSrc, /WalkInHoldPanel/);
assert.match(boardSrc, /AssignExtraToOrderDialog/);
assert.match(boardSrc, /surface === "full"/);
assert.match(boardSrc, /surface === "walk-in-hold"/);
assert.doesNotMatch(boardSrc, /layout="actions"/);

const panelSrc = readSrc("src/workspaces/extra/WalkInHoldPanel.tsx");
assert.match(panelSrc, /Walk-in Hold/);
assert.match(panelSrc, /holdExtraStockWalkInAction/);
assert.match(panelSrc, /extendExtraWalkInHoldAction/);
assert.match(panelSrc, /releaseExtraWalkInHoldAction/);
assert.match(
  panelSrc,
  /Bakery can see this hold but cannot place, extend, or release it/,
);

const liveSrc = readSrc("src/workspaces/home/HomeLiveRefresh.tsx");
assert.match(liveSrc, /table: "extra_stock"/);
assert.match(liveSrc, /visibilitychange/);

console.log("Home Fresh Picks operational quick actions: PASS");
