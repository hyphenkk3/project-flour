/**
 * Fresh Pick Ready-for-Collection availability regression tests.
 * Run: npx tsx scripts/test-extra-ready-for-collection.ts
 * These are deterministic engine tests; PostgreSQL RPC/concurrency tests require
 * the focused migration to be installed in a disposable DEV database.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { OPERATING_HOURS_SEED } from "@/engines/business-calendar/operating-hours-seed";
import { buildExtraWorkspaceCapabilities } from "@/engines/extra/capabilities";
import {
  freshPicksMethodAvailability,
  freshPicksMethodAvailabilityForItems,
  isValidExtraCustomerFulfilment,
} from "@/engines/extra/fresh-picks-fulfilment";
import { extraPickupThroughIso } from "@/engines/extra/fresh-picks-time";
import { DEFAULT_FRESH_PICKS_PREPARATION_CONFIG } from "@/engines/extra/fresh-picks-preparation";
import type { ExtraPickupWindow } from "@/engines/extra/extra-pickup";

const DATE = "2026-08-20"; // Thursday: normal pickup and dine-in hours.
const TOMORROW = "2026-08-21";
const window: ExtraPickupWindow = {
  pickupAvailableFromAt: extraPickupThroughIso(DATE, "12:00")!,
  orderCutoffAt: extraPickupThroughIso(TOMORROW, "21:00")!,
};

function malaysiaNow(clock: string): Date {
  return new Date(`${DATE}T${clock}+08:00`);
}

function valid(
  method: "pickup" | "dine_in" | "delivery",
  time: string,
  now: Date,
  ready: boolean,
) {
  return isValidExtraCustomerFulfilment({
    method,
    fulfilmentDate: DATE,
    fulfilmentTime: time,
    ...window,
    readyForCollection: ready,
    now,
    snapshot: OPERATING_HOURS_SEED,
    config: DEFAULT_FRESH_PICKS_PREPARATION_CONFIG,
  });
}

// Existing normal preparation behavior remains in force for non-Ready units.
assert.equal(valid("pickup", "17:00", malaysiaNow("15:00:00"), false), true);
assert.equal(
  freshPicksMethodAvailability("pickup", DATE, {
    window,
    readyForCollection: false,
    now: malaysiaNow("16:00:00"),
  }).available,
  false,
  "non-Ready pickup is unavailable at/after the 4 PM cutoff",
);
assert.equal(valid("pickup", "17:00", malaysiaNow("16:30:00"), true), true);
assert.equal(valid("pickup", "16:30", malaysiaNow("16:30:00"), true), false);
assert.equal(valid("pickup", "18:00", malaysiaNow("16:30:00"), true), false);

// Dine-in gets the same preparation-only bypass, still bounded by venue hours.
assert.equal(valid("dine_in", "16:30", malaysiaNow("16:15:00"), false), false);
assert.equal(valid("dine_in", "16:30", malaysiaNow("16:15:00"), true), true);
assert.equal(valid("dine_in", "17:15", malaysiaNow("16:30:00"), true), false);

// Delivery never receives the Ready bypass and retains its 3 PM operating end.
assert.equal(valid("delivery", "14:00", malaysiaNow("13:30:00"), true), false);
assert.equal(valid("delivery", "14:00", malaysiaNow("12:00:00"), false), true);
assert.equal(valid("delivery", "15:15", malaysiaNow("14:00:00"), true), false);

// An expired physical item window remains unavailable even while Ready.
const expiredWindow: ExtraPickupWindow = {
  pickupAvailableFromAt: extraPickupThroughIso(DATE, "12:00")!,
  orderCutoffAt: extraPickupThroughIso(DATE, "16:29")!,
};
assert.equal(
  isValidExtraCustomerFulfilment({
    method: "pickup",
    fulfilmentDate: DATE,
    fulfilmentTime: "17:00",
    ...expiredWindow,
    readyForCollection: true,
    now: malaysiaNow("16:30:00"),
    snapshot: OPERATING_HOURS_SEED,
  }),
  false,
);

// Exact physical items are intersected independently; one Ready member does
// not make a matching non-Ready physical unit usable after cutoff.
const mixedItems = [
  { window, readyForCollection: true },
  { window, readyForCollection: false },
];
assert.equal(
  freshPicksMethodAvailabilityForItems("pickup", DATE, mixedItems, {
    now: malaysiaNow("16:30:00"),
    snapshot: OPERATING_HOURS_SEED,
  }).available,
  false,
);
assert.equal(
  freshPicksMethodAvailabilityForItems("pickup", DATE, [mixedItems[0]!], {
    now: malaysiaNow("16:30:00"),
    snapshot: OPERATING_HOURS_SEED,
  }).available,
  true,
);

// The explicit server capabilities allow only Bakery, Manager, and Owner.
for (const role of ["bakery", "manager", "owner"] as const) {
  const capabilities = buildExtraWorkspaceCapabilities({
    role,
    staffId: "staff",
  });
  assert.equal(capabilities.canMarkReadyForCollection, true, role);
  assert.equal(capabilities.canUndoReadyForCollection, true, role);
}
const customerOperations = buildExtraWorkspaceCapabilities({
  role: "customer_operations",
  staffId: "staff",
});
assert.equal(customerOperations.canMarkReadyForCollection, false);
assert.equal(customerOperations.canUndoReadyForCollection, false);

// Static migration contracts complement the engine tests. These do not replace
// execution against PostgreSQL after the migration is installed in DEV.
const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261005234831_fresh_pick_ready_for_collection_override.sql",
  ),
  "utf8",
);
assert.match(migration, /ready_for_collection boolean not null default false/);
assert.match(migration, /array\['bakery', 'manager', 'owner'\]/);
assert.match(migration, /'ready_for_collection'/);
assert.match(migration, /'ready_for_collection_undone'/);
assert.match(migration, /for update;/i);
assert.match(migration, /if p_method in \('pickup', 'dine_in'\)/);
assert.match(
  migration,
  /perform public\._assert_fresh_picks_customer_fulfilment\([\s\S]*?v_method,[\s\S]*?v_ids\s*\);/,
);
assert.ok(
  migration.indexOf(
    "-- Ready is evaluated only after each submitted physical unit is row-locked.",
  ) >
    migration.indexOf(
      "for v_id in\n    select extra_id from unnest(v_ids) as extra_id order by extra_id",
    ),
  "The authoritative Ready check must follow exact-ID row locking.",
);
assert.match(
  migration,
  /if p_method in \('pickup', 'dine_in'\)[\s\S]*?v_ready_bypass := v_ready_count = array_length\(p_extra_stock_ids, 1\);/,
);
assert.match(
  migration,
  /if p_method = 'pickup' then[\s\S]*?elsif p_method = 'dine_in' then[\s\S]*?else[\s\S]*?is_valid_delivery_slot/,
);

console.info("Fresh Pick Ready availability tests passed.");
