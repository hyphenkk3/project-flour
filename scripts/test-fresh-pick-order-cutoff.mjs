import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const migration = read(
  "supabase/migrations/20261017021516_fresh_pick_bakery_order_cutoff_v1.sql",
);
const cutoffFn = migration.slice(
  migration.indexOf("create or replace function public.update_extra_stock_order_cutoff"),
);
const submitFn = read(
  "supabase/migrations/20261005234831_fresh_pick_ready_for_collection_override.sql",
).slice(
  read(
    "supabase/migrations/20261005234831_fresh_pick_ready_for_collection_override.sql",
  ).indexOf("create or replace function public.submit_guest_extra_order"),
);
const helperFn = migration.slice(
  migration.indexOf("create or replace function public._assert_fresh_picks_customer_fulfilment"),
  migration.indexOf("revoke all on function public._assert_fresh_picks_customer_fulfilment"),
);
const freshTime = read("src/engines/extra/fresh-picks-time.ts");
const eligibility = read("src/engines/extra/fresh-picks-eligibility.ts");
const action = read("src/workspaces/storefront/extra/actions.ts");
const board = read("src/workspaces/extra/ExtraBoard.tsx");
const cutoffDialog = read("src/workspaces/extra/ExtraOrderCutoffDialog.tsx");
const windowFields = read("src/workspaces/extra/ExtraWindowFields.tsx");
const pickup = read("src/engines/extra/extra-pickup.ts");

assert.match(migration, /drop constraint if exists extra_stock_pickup_from_order_cutoff_fields/);
assert.match(migration, /pickup_available_from_at is null or pickup_through_at is not null/);
assert.doesNotMatch(migration, /pickup_available_from_at\s*<=\s*pickup_through_at/);
assert.match(migration, /Asia\/Kuala_Lumpur/);
assert.match(migration, /extract\(minute from v_through_local\)::integer % 30 <> 0/);
assert.doesNotMatch(
  migration.slice(0, migration.indexOf("create or replace function public._assert_fresh_picks_customer_fulfilment")),
  /_pickup_slot_in_weekly_hours\(v_through_date/,
  "cutoff time is independent of pickup operating hours",
);

assert.match(submitFn, /for update/);
assert.ok(
  submitFn.indexOf("for update") < submitFn.indexOf("_assert_fresh_picks_customer_fulfilment("),
  "checkout locks inventory before validating cutoff",
);
assert.match(helperFn, /v_now >= e\.pickup_through_at/);
assert.match(helperFn, /This Extra is no longer available to order/);
assert.match(helperFn, /v_ready_bypass/);
assert.ok(
  helperFn.indexOf("v_now >= e.pickup_through_at") < helperFn.indexOf("v_ready_bypass := v_ready_count"),
  "Ready for Collection cannot bypass the listing order cutoff",
);

assert.match(cutoffFn, /_bind_rpc_actor\(p_actor_staff_id\)/);
assert.match(cutoffFn, /array\['bakery', 'manager', 'owner'\]/);
assert.match(cutoffFn, /for update/);
assert.match(cutoffFn, /stock_row\.pickup_through_at <= v_now/);
assert.match(cutoffFn, /p_pickup_through_at <= v_now and not coalesce\(p_confirm_immediate_close, false\)/);
assert.match(cutoffFn, /set pickup_through_at = p_pickup_through_at/);
assert.doesNotMatch(cutoffFn, /set[\s\S]{0,120}(sold_at|order_id|ready_for_collection)\s*=/);
assert.match(cutoffFn, /'order_cutoff_changed'/);
assert.match(cutoffFn, /revoke all on function public\.update_extra_stock_order_cutoff[\s\S]*from public, anon/);
assert.match(cutoffFn, /grant execute on function public\.update_extra_stock_order_cutoff[\s\S]*to authenticated, service_role/);

assert.match(windowFields, /Choose a cutoff time/);
assert.match(windowFields, /Choose a cutoff date/);
assert.match(windowFields, /Pickup remains available from 12:00 PM through/);
assert.match(eligibility, /Array\.from\(\{ length: 48 \}/);
assert.match(freshTime, /Asia\/Kuala_Lumpur/);
assert.match(cutoffDialog, /This cutoff will close ordering immediately\. Continue\?/);
assert.doesNotMatch(cutoffDialog, /\buseEffect\b/, "dialog state is initialized without state-setting effects");
assert.match(
  cutoffDialog,
  /key=\{`\$\{extra\.id\}:\$\{extra\.pickupThroughAt\}:\$\{open \? "open" : "closed"\}`\}/,
  "dialog remounts for a different listing, cutoff, or open session",
);
assert.match(cutoffDialog, /useState\(initialCutoff\?\.date/);
assert.match(cutoffDialog, /useState\(initialCutoff\?\.time/);
assert.match(cutoffDialog, /sm:grid-cols-2/);
assert.match(cutoffDialog, /w-full/);
assert.match(board, /Edit order cutoff/);
assert.match(board, /mt-2 flex flex-wrap gap-2["'][\s\S]{0,4000}Edit order cutoff/);
assert.match(action, /submit_guest_extra_order/);
assert.match(action, /getStorefrontExtraById\(extraStockId\)/);
assert.match(pickup, /Customer Extra pickup slots — operating hours, not order cutoff/);
assert.match(pickup, /getEffectivePickupSchedule/);

console.log("PASS Fresh Pick cutoff security and compatibility contracts");
