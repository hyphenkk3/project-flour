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
import { buildExtraWorkspaceCapabilities } from "@/engines/extra/capabilities";
import {
  extraSubmitCustomerError,
  FRESH_PICKS_SOLD_OUT_MESSAGE,
  isPublishedFreshPick,
} from "@/engines/extra/customer-fresh-picks";
import {
  EXTRA_WALK_IN_HOLD_EXTENSION_MINUTES,
  EXTRA_WALK_IN_HOLD_MINUTES,
  EXTRA_WALK_IN_HOLD_REMINDER_LEAD_MINUTES,
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
  false,
  "website catalogue hides an active hold",
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
