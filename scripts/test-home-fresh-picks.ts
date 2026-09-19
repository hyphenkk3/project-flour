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

const pageSrc = readSrc("src/app/(app)/home/page.tsx");
assert.match(pageSrc, /listHomeFreshPickUnits/);
assert.match(pageSrc, /canSeeHomeFreshPicks/);
assert.match(pageSrc, /buildExtraWorkspaceCapabilities/);
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
assert.match(homeOpsSrc, /extraOperationalActionFlags/);
assert.match(homeOpsSrc, /Assign to order/);
assert.match(homeOpsSrc, /Move pickup window/);
assert.match(homeOpsSrc, /Cut into slices/);
assert.match(homeOpsSrc, /Undo availability/);
assert.match(homeOpsSrc, /No Fresh Picks right now/);
assert.match(homeOpsSrc, /customer-operations\/fresh-picks/);
assert.match(homeOpsSrc, /\/bakery\/extra/);
assert.doesNotMatch(homeOpsSrc, /from "@\/workspaces\/extra\/ExtraBoard"/);
assert.doesNotMatch(homeOpsSrc, /Propose EXTRA/);
assert.doesNotMatch(homeOpsSrc, /Confirm Available/);

const querySrc = readSrc("src/workspaces/extra/queries.ts");
assert.match(querySrc, /export async function listHomeFreshPickUnits/);
assert.match(querySrc, /isExtraConfirmedOnOffer/);
assert.match(querySrc, /\.eq\("lifecycle", "confirmed"\)/);
assert.match(querySrc, /\.is\("sold_at", null\)/);
assert.match(querySrc, /\.is\("cut_into_slices_at", null\)/);

const actionsSrc = readSrc("src/workspaces/extra/actions.ts");
assert.match(actionsSrc, /revalidatePath\("\/home"\)/);
assert.match(actionsSrc, /requireExtraStaff/);
assert.match(actionsSrc, /requireWalkInHoldStaff/);
assert.match(actionsSrc, /if \(!caps\.canAssignExtraToOrder\)/);
assert.match(actionsSrc, /if \(!caps\.canCreateWalkInHold\)/);

const boardSrc = readSrc("src/workspaces/extra/ExtraBoard.tsx");
assert.match(boardSrc, /WalkInHoldPanel/);
assert.match(boardSrc, /AssignExtraToOrderDialog/);
assert.match(boardSrc, /surface === "full"/);
assert.match(boardSrc, /surface === "walk-in-hold"/);

const panelSrc = readSrc("src/workspaces/extra/WalkInHoldPanel.tsx");
assert.match(panelSrc, /Walk-in Hold/);
assert.match(panelSrc, /holdExtraStockWalkInAction/);
assert.match(panelSrc, /extendExtraWalkInHoldAction/);
assert.match(panelSrc, /releaseExtraWalkInHoldAction/);
assert.match(
  panelSrc,
  /Bakery can see this hold but cannot place, extend, or release it/,
);

console.log("Home Fresh Picks operational quick actions: PASS");
